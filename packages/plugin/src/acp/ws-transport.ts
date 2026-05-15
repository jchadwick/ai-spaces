import type { WebSocket as WsWebSocket } from 'ws';

/**
 * Bridges a ws package WebSocket to the WritableStream/ReadableStream pair
 * expected by ndJsonStream(output, input) from @agentclientprotocol/sdk.
 *
 * ndJsonStream(output, input):
 *   output: WritableStream — where we WRITE to send messages to the peer
 *   input:  ReadableStream — where we READ to receive messages from the peer
 */
export function wsToAcpStream(ws: WsWebSocket): {
  output: WritableStream<Uint8Array>;
  input: ReadableStream<Uint8Array>;
} {
  let isClosed = false;

  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        ws.send(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    close() {
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
    abort() {
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
  });

  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const onMessage = (data: Buffer | ArrayBuffer | Buffer[] | string) => {
    if (isClosed) return;
    try {
      if (typeof data === 'string') {
        streamController.enqueue(new TextEncoder().encode(data));
      } else if (Buffer.isBuffer(data)) {
        streamController.enqueue(data);
      } else if (data instanceof ArrayBuffer) {
        streamController.enqueue(new Uint8Array(data));
      } else {
        streamController.enqueue(Buffer.concat(data));
      }
    } catch {
      // Stream already closed/errored
    }
  };

  const onClose = () => {
    if (isClosed) return;
    isClosed = true;
    try {
      streamController.close();
    } catch {
      // Already closed
    }
  };

  const onError = (err: Error) => {
    if (isClosed) return;
    isClosed = true;
    try {
      streamController.error(err);
    } catch {
      // Already errored
    }
  };

  const input = new ReadableStream<Uint8Array>({
    start(ctrl) {
      streamController = ctrl;
      ws.on('message', onMessage);
      ws.on('close', onClose);
      ws.on('error', onError);
    },
    cancel() {
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
  });

  return { output, input };
}
