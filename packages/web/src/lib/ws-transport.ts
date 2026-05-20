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
  let detachListeners: (() => void) | null = null;

  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      if (!isClosed && ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
      }
    },
    close() {
      detachListeners?.();
      detachListeners = null;
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
    abort() {
      detachListeners?.();
      detachListeners = null;
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

      const onMessage = async (event: Event) => {
        if (isClosed) return;
        const messageEvent = event as MessageEvent;
        let chunk: Uint8Array;
        if (typeof messageEvent.data === 'string') {
          chunk = encoder.encode(messageEvent.data);
        } else if (messageEvent.data instanceof ArrayBuffer) {
          chunk = new Uint8Array(messageEvent.data);
        } else if (messageEvent.data instanceof Blob) {
          const buf = await messageEvent.data.arrayBuffer();
          if (isClosed) return;
          chunk = new Uint8Array(buf);
        } else {
          return;
        }
        controller.enqueue(chunk);
      };

      const onClose = () => {
        if (!isClosed) {
          isClosed = true;
          try { controller.close(); } catch { /* ignore */ }
        }
      };

      const onError = () => {
        if (!isClosed) {
          isClosed = true;
          try { controller.error(new Error('WebSocket error')); } catch { /* ignore */ }
        }
      };

      ws.addEventListener('message', onMessage);
      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onError);

      detachListeners = () => {
        ws.removeEventListener('message', onMessage);
        ws.removeEventListener('close', onClose);
        ws.removeEventListener('error', onError);
      };
    },
    cancel() {
      detachListeners?.();
      detachListeners = null;
      if (!isClosed) {
        isClosed = true;
        ws.close();
      }
    },
  });

  return { output, input };
}
