import { Duplex, DuplexOptions } from 'stream';
import { MessagePort } from 'worker_threads';

const kPort = Symbol('kPort');

export class MessagePortDuplex extends Duplex {
  private [kPort]: MessagePort;

  constructor(port: MessagePort, options?: DuplexOptions) {
    super(options);
    this[kPort] = port;
    port.on('message', (data) => this.push(data));
  }

  _read(): void {
    this[kPort].start();
  }

  _write(buf: Buffer, _: string, cb: (error?: Error | null) => void): void {
    // Transfer the underlying ArrayBuffer
    if (buf.buffer instanceof ArrayBuffer) {
      this[kPort].postMessage(buf, [buf.buffer]);
    } else {
      // Fallback for SharedArrayBuffer or other cases
      this[kPort].postMessage(buf);
    }
    cb();
  }

  _final(cb: (error?: Error | null) => void): void {
    this[kPort].postMessage(null);
    cb();
  }

  _destroy(err: Error | null, cb: (error: Error | null) => void): void {
    this[kPort].removeAllListeners('message');
    this[kPort].close();
    cb(err);
  }
}