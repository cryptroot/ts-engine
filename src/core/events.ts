export type EventMap = { [K in string]: unknown };

type Listener<TPayload> = (payload: TPayload) => void;

interface Subscription {
  readonly listener: Listener<never>;
  readonly handler: Listener<never>;
  active: boolean;
}

export class EventEmitter<TEvents extends EventMap> {
  private readonly subscriptions = new Map<keyof TEvents, Subscription[]>();

  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
    const subscription = this.add(event, listener, listener);
    return () => this.remove(event, subscription);
  }

  once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
    const subscription = this.add(event, listener, (payload) => {
      this.remove(event, subscription);
      listener(payload);
    });
    return () => this.remove(event, subscription);
  }

  off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
    const subscription = this.subscriptions.get(event)?.find((s) => s.listener === listener);
    if (subscription) this.remove(event, subscription);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const subscriptions = this.subscriptions.get(event);
    if (!subscriptions) return;
    for (const subscription of [...subscriptions]) {
      if (subscription.active) (subscription.handler as Listener<TEvents[K]>)(payload);
    }
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.subscriptions.get(event)?.length ?? 0;
  }

  clear(): void {
    for (const subscriptions of this.subscriptions.values()) {
      for (const subscription of subscriptions) subscription.active = false;
    }
    this.subscriptions.clear();
  }

  private add<K extends keyof TEvents>(
    event: K,
    listener: Listener<TEvents[K]>,
    handler: Listener<TEvents[K]>,
  ): Subscription {
    const subscription: Subscription = { listener, handler, active: true };
    const subscriptions = this.subscriptions.get(event);
    if (subscriptions) {
      subscriptions.push(subscription);
    } else {
      this.subscriptions.set(event, [subscription]);
    }
    return subscription;
  }

  private remove(event: keyof TEvents, subscription: Subscription): void {
    if (!subscription.active) return;
    subscription.active = false;
    const subscriptions = this.subscriptions.get(event);
    if (!subscriptions) return;
    const index = subscriptions.indexOf(subscription);
    if (index !== -1) subscriptions.splice(index, 1);
    if (subscriptions.length === 0) this.subscriptions.delete(event);
  }
}
