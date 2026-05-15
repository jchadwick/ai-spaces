type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreakerError extends Error {
  readonly code = 'CIRCUIT_OPEN';
  constructor() {
    super('Service Degraded — circuit breaker is open');
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getStatus(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed < this.options.resetTimeoutMs) {
        throw new CircuitBreakerError();
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.options.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }
}
