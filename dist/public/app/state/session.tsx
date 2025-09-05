export class Session {
  id: string | null;

  constructor() {
    this.id = null;
  }

  async ensure(): Promise<string> {
    const stored = globalThis.localStorage?.getItem('sessionId');
    if (stored) {
      this.id = stored;
      return this.id;
    }
    const b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const toHex = (buf: Uint8Array): string => Array.from(buf).map((x) => x.toString(16).padStart(2, '0')).join('');
    const hex = toHex(b);
    this.id = `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
    globalThis.localStorage?.setItem('sessionId', this.id);
    return this.id;
  }
}

