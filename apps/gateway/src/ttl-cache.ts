/** 有効期限付きのメモリキャッシュ。同時に同じキーを読み込む場合は 1 回にまとめる */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key)
    if (entry && entry.expiresAt > this.now()) return entry.value
    const value = load()
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
    // 読み込みに失敗した結果はキャッシュしない
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
    })
    return value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of this.entries.keys()) if (predicate(key)) this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
