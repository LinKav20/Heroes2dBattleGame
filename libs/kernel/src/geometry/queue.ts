interface Queued<Item> {
  readonly item: Item;
  readonly priority: number;
  readonly tie: number;
  readonly order: number;
}

/**
 * A queue that gives out its items by the smallest priority first, of equal priorities by the smallest tie, and of
 * equal ties in the order they came in.
 */
export class PriorityQueue<Item> {
  private readonly heap: Array<Queued<Item>> = [];

  private added = 0;

  /** Puts an item into the queue with a priority and a tie that orders items of equal priority. */
  push(item: Item, priority: number, tie = 0): void {
    this.heap.push({ item, order: this.added, priority, tie });
    this.added += 1;
    this.rise(this.heap.length - 1);
  }

  /** Takes the item with the smallest priority out of the queue, or nothing if the queue is empty. */
  pop(): Item | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();

    if (top === undefined || last === undefined) return undefined;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sink(0);
    }

    return top.item;
  }

  private rise(start: number): void {
    let index = start;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (!this.before(index, parent)) return;

      this.swap(index, parent);
      index = parent;
    }
  }

  private sink(start: number): void {
    let index = start;

    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.heap.length && this.before(left, smallest)) smallest = left;

      if (right < this.heap.length && this.before(right, smallest)) smallest = right;

      if (smallest === index) return;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private before(left: number, right: number): boolean {
    const first = this.heap[left];
    const second = this.heap[right];

    if (first === undefined || second === undefined) return false;

    if (first.priority !== second.priority) return first.priority < second.priority;

    return first.tie === second.tie ? first.order < second.order : first.tie < second.tie;
  }

  private swap(left: number, right: number): void {
    const first = this.heap[left];
    const second = this.heap[right];

    if (first === undefined || second === undefined) return;

    this.heap[left] = second;
    this.heap[right] = first;
  }
}
