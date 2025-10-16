import { XMLBuilder } from 'fast-xml-parser';
import { ParsedPath } from './types';

// Properly encode a path for use in WebDAV href
// Encodes each segment separately to preserve / separators
export function encodeWebDAVPath(path: string): string {
    const parts = path.split('/');
    return parts.map(part => encodeURIComponent(part)).join('/');
}

// Parse WebDAV path: /bucket/folder/file -> { bucket, objectPath }
export function parseWebDAVPath(urlPath: string): ParsedPath {
    // First, repeatedly remove any "dav://hostname:port/dav" patterns that appear anywhere
    let previousPath = '';
    while (previousPath !== urlPath) {
        previousPath = urlPath;
        // Remove full protocol URLs: dav://localhost:3001/dav/
        urlPath = urlPath.replace(/dav:\/\/[^\/]+\/dav\/?/g, '');
        // Remove partial protocol indicators: /dav:
        urlPath = urlPath.replace(/\/dav:[^\/]*/g, '');
    }
    
    // Remove /dav/ prefix at the start
    if (urlPath.startsWith('/dav/')) {
        urlPath = urlPath.substring(4);
    }
    
    // Remove standalone dav: at the start
    if (urlPath.startsWith('dav:')) {
        urlPath = urlPath.substring(4);
    }
    
    // Ensure we have at least a "/"
    if (!urlPath || urlPath === '') {
        urlPath = '/';
    }
    
    // Ensure it starts with /
    if (!urlPath.startsWith('/')) {
        urlPath = '/' + urlPath;
    }
    
    const parts = urlPath.split('/').filter(p => p);
    if (parts.length === 0) {
        return { bucket: null, objectPath: '/' };
    }
    // Decode each segment for objectPath
    const bucket = decodeURIComponent(parts[0]);
    const objectPath = parts.length > 1
        ? '/' + parts.slice(1).map(decodeURIComponent).join('/')
        : '/';
    return { bucket, objectPath };
}

// Generate XML response for PROPFIND using proper XML library
export function generatePropfindXML(items: any[], requestPath: string): string {
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        suppressEmptyNode: true,
    });
    
    const responses = items.map(item => {
        const response: any = {
            'D:href': item.href,
            'D:propstat': {
                'D:prop': {
                    'D:displayname': item.name,
                    'D:getcontentlength': item.size || 0,
                    'D:getlastmodified': item.modified || new Date().toUTCString(),
                    'D:resourcetype': item.isDirectory ? { 'D:collection': '' } : undefined,
                },
                'D:status': 'HTTP/1.1 200 OK',
            },
        };
        
        if (item.contentType && !item.isDirectory) {
            response['D:propstat']['D:prop']['D:getcontenttype'] = item.contentType;
        }
        
        return response;
    });
    
    const xmlObj = {
        '?xml': {
            '@_version': '1.0',
            '@_encoding': 'utf-8',
        },
        'D:multistatus': {
            '@_xmlns:D': 'DAV:',
            'D:response': responses,
        },
    };
    
    return builder.build(xmlObj);
}
