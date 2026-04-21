export type Listener<T> = (state: T) => void;

export class Store<T> {
  private state: T;
  private listeners: Listener<T>[] = [];

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): T {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
