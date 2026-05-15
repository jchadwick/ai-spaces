/**
 * Browser-native WebSocket → ACP stream adapter.
 * Used to bridge the native WebSocket API to ndJsonStream().
 *
 * ACP convention: output = write TO agent, input = read FROM agent.
 */
export function wsToAcpStream(ws: WebSocket): {
  output: WritableStream<Uint8Array>;
  input: ReadableStream<Uint8Array>;
} {
  let isClosed = false;
  const encoder = new TextEncoder();

  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      if (!isClosed && ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
      }
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

  let controller: ReadableStreamDefaultController<Uint8Array>;

  const input = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;

      ws.onmessage = (event: MessageEvent) => {
        if (isClosed) return;
        let chunk: Uint8Array;
        if (typeof event.data === 'string') {
          chunk = encoder.encode(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          chunk = new Uint8Array(event.data);
        } else {
          return;
        }
        controller.enqueue(chunk);
      };

      ws.onclose = () => {
        if (!isClosed) {
          isClosed = true;
          try { controller.close(); } catch { /* ignore */ }
        }
      };

      ws.onerror = () => {
        if (!isClosed) {
          isClosed = true;
          try { controller.error(new Error('WebSocket error')); } catch { /* ignore */ }
        }
      };
    },
    cancel() {
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
  });

  return { output, input };
}
