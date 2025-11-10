import { createHmac, createHash } from 'crypto';
import { IncomingHttpHeaders } from 'http';

/**
 * Static utility class for AWS S3 Signature Version 4 authentication
 * Compatible with Express.js request objects
 * 
 * @example
 * ```typescript
 * // In your Express route handler
 * const isValid = S3SigV4Auth.verify(
 *   req.method,
 *   req.path,
 *   req.headers,
 *   req.body,
 *   'AKIA4774203F7B98S85D',
 *   '6pZkq9KTzyz1X2AkdxtEKey2uZYN0ZD2Z2qt73Jv'
 * );
 * ```
 */
export class S3SigV4Auth {
  /**
   * Extracts the Access Key ID from the Authorization header
   * Useful for database lookups to retrieve the corresponding secret key
   * 
   * @param headers - Express request headers object
   * @returns Access Key ID or null if not found or invalid header
   * 
   * @example
   * ```typescript
   * const keyId = S3SigV4Auth.extractAccessKeyId(req.headers);
   * if (keyId) {
   *   const secretKey = await db.getSecretKey(keyId);
   *   const isValid = S3SigV4Auth.verify(req.method, req.path, req.headers, req.body, keyId, secretKey);
   * }
   * ```
   */
  static extractAccessKeyId(headers: IncomingHttpHeaders): string | null {
    try {
      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!authHeader || typeof authHeader !== 'string') {
        return null;
      }

      const authParts = this.parseAuthorizationHeader(authHeader);
      return authParts ? authParts.accessKeyId : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extracts the S3 path from an Express request
   * Removes the '/s3' prefix that your server adds
   * 
   * @param path - Express req.path or req.url
   * @param baseRoute - The base route to strip (default: '/s3')
   * @returns The S3 path that the client signed (e.g., '/' or '/bucket/key')
   * 
   * @example
   * ```typescript
   * // If req.path is '/s3/' or '/s3/bucket/key'
   * const s3Path = S3SigV4Auth.extractS3Path(req.path); // Returns '/' or '/bucket/key'
   * ```
   */
  static extractS3Path(path: string, baseRoute: string = '/s3'): string {
    // Split path and query string
    const [pathOnly, queryString] = path.split('?');
    
    // Remove base route prefix
    let s3Path = pathOnly;
    if (pathOnly.startsWith(baseRoute)) {
      s3Path = pathOnly.substring(baseRoute.length) || '/';
    }
    
    // Re-append query string if it exists
    if (queryString) {
      return `${s3Path}?${queryString}`;
    }
    
    return s3Path;
  }

  /**
   * Attempts to verify signature with multiple path variations
   * AWS SDKs may sign paths differently based on endpoint configuration
   * 
   * @param method - HTTP method
   * @param originalUrl - Express req.originalUrl (includes full path)
   * @param path - Express req.path (may be modified by routing)
   * @param headers - Request headers
   * @param body - Request body
   * @param accessKeyId - AWS Access Key ID
   * @param secretAccessKey - AWS Secret Access Key
   * @returns Object with validation result and which path variation worked
   */
  static verifyWithPathDetection(
    method: string,
    originalUrl: string,
    path: string,
    headers: IncomingHttpHeaders,
    body: string | Buffer | undefined,
    accessKeyId: string,
    secretAccessKey: string
  ): {
    isValid: boolean;
    matchedPath: string | null;
    receivedSignature: string | null;
    pathAttempts: Array<{ 
      path: string; 
      isValid: boolean; 
      calculatedSignature: string | null; 
      canonicalRequest: string | null;
      error?: string;
    }>;
  } {
    // Try different path variations that SDKs might use
    const pathsToTry = [
      originalUrl,
    ];

    // For bucket operations, also try as if it's virtual-host style
    // Client might sign: GET /?delimiter=%2F&list-type=2&prefix=
    // Instead of: GET /bucket?delimiter=%2F&list-type=2&prefix=
    // Or: GET /key/path instead of GET /bucket/key/path
    const [pathPart, query] = originalUrl.split('?');
    
    // Strip /s3 prefix first
    const s3Path = this.extractS3Path(pathPart);
    const s3PathSegments = s3Path.split('/').filter(s => s);
    
    if (s3PathSegments.length >= 1) {
      if (query) {
        // Try root path with query (virtual-host style for list operations)
        pathsToTry.push(`/?${query}`);
      }
      
      if (s3PathSegments.length >= 2) {
        // For object operations like /bucket/key or /bucket/folder/key
        // Try removing the bucket from the path: /key or /folder/key
        const pathWithoutBucket = '/' + s3PathSegments.slice(1).join('/');
        pathsToTry.push(query ? `${pathWithoutBucket}?${query}` : pathWithoutBucket);
      }
    }

    // Remove duplicates
    const uniquePaths = [...new Set(pathsToTry)];
    
    const pathAttempts: Array<{ 
      path: string; 
      isValid: boolean; 
      calculatedSignature: string | null; 
      canonicalRequest: string | null;
      error?: string;
    }> = [];

    // Get received signature once
    const authHeader = headers['authorization'] || headers['Authorization'];
    const authParts = authHeader && typeof authHeader === 'string' ? this.parseAuthorizationHeader(authHeader) : null;
    const receivedSignature = authParts?.signature || null;

    for (const testPath of uniquePaths) {
      const details = this.verifyWithDetails(
        method,
        testPath,
        headers,
        body,
        accessKeyId,
        secretAccessKey
      );

      pathAttempts.push({
        path: testPath,
        isValid: details.isValid,
        calculatedSignature: details.calculatedSignature,
        canonicalRequest: details.canonicalRequest,
        error: details.error
      });

      if (details.isValid) {
        return {
          isValid: true,
          matchedPath: testPath,
          receivedSignature,
          pathAttempts
        };
      }
    }

    return {
      isValid: false,
      matchedPath: null,
      receivedSignature,
      pathAttempts
    };
  }

  /**
   * Verifies the signature and returns detailed information about the verification process
   * Useful for troubleshooting authentication issues
   * 
   * @param method - HTTP method
   * @param path - Request path including query string
   * @param headers - Request headers
   * @param body - Request body (can be undefined for GET/HEAD requests)
   * @param accessKeyId - AWS Access Key ID
   * @param secretAccessKey - AWS Secret Access Key
   * @returns Object containing all intermediate values used in signature calculation
   */
  static verifyWithDetails(
    method: string,
    path: string,
    headers: IncomingHttpHeaders,
    body: string | Buffer | undefined,
    accessKeyId: string,
    secretAccessKey: string
  ): {
    isValid: boolean;
    receivedSignature: string | null;
    calculatedSignature: string | null;
    canonicalRequest: string | null;
    stringToSign: string | null;
    signedHeaders: string[];
    region: string | null;
    service: string | null;
    date: string | null;
    error?: string;
  } {
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      return {
        isValid: false,
        receivedSignature: null,
        calculatedSignature: null,
        canonicalRequest: null,
        stringToSign: null,
        signedHeaders: [],
        region: null,
        service: null,
        date: null,
        error: 'Missing or invalid authorization header'
      };
    }

    const authParts = this.parseAuthorizationHeader(authHeader);
    if (!authParts) {
      return {
        isValid: false,
        receivedSignature: null,
        calculatedSignature: null,
        canonicalRequest: null,
        stringToSign: null,
        signedHeaders: [],
        region: null,
        service: null,
        date: null,
        error: 'Failed to parse authorization header'
      };
    }

    if (authParts.accessKeyId !== accessKeyId) {
      return {
        isValid: false,
        receivedSignature: authParts.signature,
        calculatedSignature: null,
        canonicalRequest: null,
        stringToSign: null,
        signedHeaders: authParts.signedHeaders,
        region: authParts.region,
        service: authParts.service,
        date: authParts.date,
        error: 'Access Key ID mismatch'
      };
    }

    const dateHeader = headers['x-amz-date'] || headers['X-Amz-Date'];
    if (!dateHeader || typeof dateHeader !== 'string') {
      return {
        isValid: false,
        receivedSignature: authParts.signature,
        calculatedSignature: null,
        canonicalRequest: null,
        stringToSign: null,
        signedHeaders: authParts.signedHeaders,
        region: authParts.region,
        service: authParts.service,
        date: authParts.date,
        error: 'Missing x-amz-date header'
      };
    }

    try {
      // Create canonical request
      const canonicalRequest = this.createCanonicalRequest(
        method,
        path,
        headers,
        body,
        authParts.signedHeaders
      );

      // Create string to sign
      const date = dateHeader.substring(0, 8);
      const credentialScope = `${date}/${authParts.region}/${authParts.service}/aws4_request`;
      const stringToSign = this.createStringToSign(
        dateHeader,
        credentialScope,
        canonicalRequest
      );

      // Calculate signature
      const signingKey = this.getSigningKey(
        secretAccessKey,
        date,
        authParts.region,
        authParts.service
      );
      const calculatedSignature = createHmac('sha256', signingKey)
        .update(stringToSign)
        .digest('hex');

      return {
        isValid: calculatedSignature === authParts.signature,
        receivedSignature: authParts.signature,
        calculatedSignature,
        canonicalRequest,
        stringToSign,
        signedHeaders: authParts.signedHeaders,
        region: authParts.region,
        service: authParts.service,
        date: authParts.date
      };
    } catch (error) {
      return {
        isValid: false,
        receivedSignature: authParts.signature,
        calculatedSignature: null,
        canonicalRequest: null,
        stringToSign: null,
        signedHeaders: authParts.signedHeaders,
        region: authParts.region,
        service: authParts.service,
        date: authParts.date,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verifies the AWS Signature Version 4 authentication for an incoming request
   * 
   * @param method - HTTP method (GET, PUT, POST, DELETE, etc.)
   * @param path - Request path including query string (e.g., '/s3/bucket/key?versioning')
   * @param headers - Express request headers object
   * @param body - Request body (string, Buffer, or undefined for GET/HEAD requests)
   * @param accessKeyId - AWS Access Key ID to validate against
   * @param secretAccessKey - AWS Secret Access Key for signature calculation
   * @returns True if signature is valid, false otherwise
   */
  static verify(
    method: string,
    path: string,
    headers: IncomingHttpHeaders,
    body: string | Buffer | undefined,
    accessKeyId: string,
    secretAccessKey: string
  ): boolean {
    try {
      // Extract authorization header
      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!authHeader || typeof authHeader !== 'string') {
        return false;
      }

      // Parse authorization header
      const authParts = this.parseAuthorizationHeader(authHeader);
      if (!authParts || authParts.accessKeyId !== accessKeyId) {
        return false;
      }

      // Get required headers
      const dateHeader = headers['x-amz-date'] || headers['X-Amz-Date'];
      if (!dateHeader || typeof dateHeader !== 'string') {
        return false;
      }

      // Calculate expected signature
      const expectedSignature = this.calculateSignature(
        method,
        path,
        headers,
        body,
        secretAccessKey,
        authParts.region,
        authParts.service,
        dateHeader,
        authParts.signedHeaders
      );

      return expectedSignature === authParts.signature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parses the AWS Authorization header
   * 
   * @param authHeader - Authorization header value
   * @returns Parsed authorization components or null if invalid
   * 
   * @example
   * Input: "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-date, Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024"
   */
  private static parseAuthorizationHeader(authHeader: string): {
    accessKeyId: string;
    date: string;
    region: string;
    service: string;
    signedHeaders: string[];
    signature: string;
  } | null {
    const regex = /AWS4-HMAC-SHA256 Credential=([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/aws4_request,\s*SignedHeaders=([^,]+),\s*Signature=(.+)/;
    const match = authHeader.match(regex);

    if (!match) {
      return null;
    }

    return {
      accessKeyId: match[1],
      date: match[2],
      region: match[3],
      service: match[4],
      signedHeaders: match[5].split(';'),
      signature: match[6]
    };
  }

  /**
   * Calculates the AWS Signature Version 4 signature
   * 
   * @param method - HTTP method
   * @param path - Request path with query string
   * @param headers - Request headers
   * @param body - Request body (can be undefined for GET/HEAD requests)
   * @param secretAccessKey - AWS Secret Access Key
   * @param region - AWS region from the authorization header
   * @param service - AWS service from the authorization header
   * @param amzDate - AWS date header (ISO 8601 format: YYYYMMDDTHHMMSSZ)
   * @param signedHeaders - List of signed header names
   * @returns Calculated signature (hex string)
   */
  private static calculateSignature(
    method: string,
    path: string,
    headers: IncomingHttpHeaders,
    body: string | Buffer | undefined,
    secretAccessKey: string,
    region: string,
    service: string,
    amzDate: string,
    signedHeaders: string[]
  ): string {
    // Step 1: Create canonical request
    const canonicalRequest = this.createCanonicalRequest(
      method,
      path,
      headers,
      body,
      signedHeaders
    );

    // Step 2: Create string to sign
    const date = amzDate.substring(0, 8); // YYYYMMDD
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = this.createStringToSign(
      amzDate,
      credentialScope,
      canonicalRequest
    );

    // Step 3: Calculate signing key
    const signingKey = this.getSigningKey(
      secretAccessKey,
      date,
      region,
      service
    );

    // Step 4: Calculate signature
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    return signature;
  }

  /**
   * Creates the canonical request string as per AWS SigV4 specification
   * 
   * @param method - HTTP method
   * @param path - Request path with query string
   * @param headers - Request headers
   * @param body - Request body (can be undefined for GET/HEAD requests)
   * @param signedHeaders - List of signed header names
   * @returns Canonical request string
   */
  private static createCanonicalRequest(
    method: string,
    path: string,
    headers: IncomingHttpHeaders,
    body: string | Buffer | undefined,
    signedHeaders: string[]
  ): string {
    // Parse URI and query string
    const [uriPath, queryString] = path.split('?');
    
    // Canonical URI (must be encoded)
    const canonicalUri = this.encodeURIPath(uriPath);

    // Canonical query string
    const canonicalQueryString = this.createCanonicalQueryString(queryString || '');

    // Canonical headers
    const canonicalHeaders = this.createCanonicalHeaders(headers, signedHeaders);

    // Signed headers (semicolon-separated list)
    const signedHeadersString = signedHeaders.join(';');

    // Payload hash
    const payloadHash = this.hashPayload(body);

    // Combine into canonical request
    return [
      method.toUpperCase(),
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeadersString,
      payloadHash
    ].join('\n');
  }

  /**
   * Encodes URI path according to AWS SigV4 specification
   * Encodes every byte except unreserved characters (A-Z, a-z, 0-9, hyphen, underscore, period, and tilde)
   * 
   * @param path - URI path to encode
   * @returns Encoded URI path
   */
  private static encodeURIPath(path: string): string {
    return path.split('/').map(segment => {
      // Decode first to handle already-encoded segments, then re-encode properly
      try {
        const decoded = decodeURIComponent(segment);
        return encodeURIComponent(decoded).replace(/[!'()*]/g, (c) => {
          return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
      } catch {
        // If decoding fails, segment might not be encoded or is malformed
        // Just encode it as-is
        return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => {
          return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
      }
    }).join('/');
  }

  /**
   * Creates canonical query string by sorting parameters and encoding them
   * 
   * @param queryString - Query string from URL
   * @returns Canonical query string
   */
  private static createCanonicalQueryString(queryString: string): string {
    if (!queryString) {
      return '';
    }

    const params = queryString.split('&').map(param => {
      const equalIndex = param.indexOf('=');
      if (equalIndex === -1) {
        // No equals sign, treat as key with no value
        return { key: param, value: '' };
      }
      const key = param.substring(0, equalIndex);
      const value = param.substring(equalIndex + 1);
      return { key, value };
    });

    // Sort by key, then by value (AWS requirement)
    params.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      return 0;
    });

    return params.map(p => `${p.key}=${p.value}`).join('&');
  }

  /**
   * Creates canonical headers string from signed headers
   * Headers must be lowercase, sorted, and trimmed
   * 
   * @param headers - Request headers
   * @param signedHeaders - List of header names to include
   * @returns Canonical headers string (includes trailing newline)
   */
  private static createCanonicalHeaders(
    headers: IncomingHttpHeaders,
    signedHeaders: string[]
  ): string {
    const canonicalHeaders: string[] = [];

    for (const headerName of signedHeaders) {
      const headerValue = headers[headerName] || headers[headerName.toLowerCase()];
      if (headerValue !== undefined) {
        // Trim and collapse multiple spaces
        const trimmedValue = String(headerValue).trim().replace(/\s+/g, ' ');
        canonicalHeaders.push(`${headerName.toLowerCase()}:${trimmedValue}`);
      }
    }

    return canonicalHeaders.join('\n') + '\n';
  }

  /**
   * Calculates SHA256 hash of the request payload
   * 
   * @param body - Request body (can be undefined for GET/HEAD requests)
   * @returns Hex-encoded SHA256 hash
   */
  private static hashPayload(body: string | Buffer | undefined, headers?: IncomingHttpHeaders): string {
    // Check if client provided pre-computed content hash or UNSIGNED-PAYLOAD
    if (headers) {
      const contentSha256 = headers['x-amz-content-sha256'] || headers['X-Amz-Content-Sha256'];
      if (contentSha256 && typeof contentSha256 === 'string') {
        // Special case: UNSIGNED-PAYLOAD means the client wants to skip payload verification
        // In this case, we use the literal string 'UNSIGNED-PAYLOAD' in the canonical request
        if (contentSha256 === 'UNSIGNED-PAYLOAD') {
          return 'UNSIGNED-PAYLOAD';
        }
        // Otherwise, use the provided hash (common for large uploads to avoid re-computing)
        return contentSha256;
      }
    }
    
    if (!body || (typeof body === 'string' && body.length === 0)) {
      // Empty body
      return createHash('sha256').update('').digest('hex');
    }
    const bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body;
    return createHash('sha256').update(bodyBuffer).digest('hex');
  }

  /**
   * Creates the string to sign as per AWS SigV4 specification
   * 
   * @param amzDate - AWS date in ISO 8601 format
   * @param credentialScope - Credential scope string
   * @param canonicalRequest - Canonical request string
   * @returns String to sign
   */
  private static createStringToSign(
    amzDate: string,
    credentialScope: string,
    canonicalRequest: string
  ): string {
    const hashedCanonicalRequest = createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    return [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
  }

  /**
   * Derives the signing key using HMAC-SHA256
   * 
   * @param secretAccessKey - AWS Secret Access Key
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name
   * @returns Signing key (Buffer)
   */
  private static getSigningKey(
    secretAccessKey: string,
    date: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = createHmac('sha256', `AWS4${secretAccessKey}`)
      .update(date)
      .digest();

    const kRegion = createHmac('sha256', kDate)
      .update(region)
      .digest();

    const kService = createHmac('sha256', kRegion)
      .update(service)
      .digest();

    const kSigning = createHmac('sha256', kService)
      .update('aws4_request')
      .digest();

    return kSigning;
  }

  /**
   * Generates authorization header for making requests to S3-compatible services
   * Useful for testing or proxying requests
   * 
   * @param method - HTTP method
   * @param path - Request path with query string
   * @param headers - Request headers (must include host and x-amz-date)
   * @param body - Request body (can be undefined for GET/HEAD requests)
   * @param accessKeyId - AWS Access Key ID
   * @param secretAccessKey - AWS Secret Access Key
   * @param region - AWS region (optional, defaults to 'us-east-1')
   * @param service - AWS service (optional, defaults to 's3')
   * @returns Authorization header value
   */
  static generateAuthHeader(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    accessKeyId: string,
    secretAccessKey: string,
    region: string = 'us-east-1',
    service: string = 's3'
  ): string {
    const amzDate = headers['x-amz-date'] || headers['X-Amz-Date'];
    if (!amzDate) {
      throw new Error('x-amz-date header is required');
    }

    const date = amzDate.substring(0, 8);
    const signedHeaders = Object.keys(headers)
      .map(h => h.toLowerCase())
      .sort();

    const signature = this.calculateSignature(
      method,
      path,
      headers,
      body,
      secretAccessKey,
      region,
      service,
      amzDate,
      signedHeaders
    );

    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    
    return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;
  }
}