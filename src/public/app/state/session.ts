export class Session {
  private _id: string | null = null;

  get id(): string | null {
    return this._id;
  }

  async ensure(): Promise<string> {
    const stored = localStorage.getItem('sessionId');
    if (stored) {
      this._id = stored;
      return this._id;
    }
    
    // Generate a RFC4122-ish v4 id without external deps
    const rnd = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
    const toHex = (buf: Uint8Array): string => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
    const b = rnd(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = toHex(b);
    this._id = `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
    localStorage.setItem('sessionId', this._id);
    return this._id;
  }
}