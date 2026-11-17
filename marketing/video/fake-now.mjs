// Video-recording only: shifts this Node process's clock by FAKE_NOW_OFFSET_MS so the demo can be
// filmed at "lunch time" whatever the real time is. Load with: NODE_OPTIONS="--import <this file>".
const offset = Number(process.env.FAKE_NOW_OFFSET_MS ?? 0);
if (offset) {
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;
}
