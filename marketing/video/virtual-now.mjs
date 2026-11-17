// Prints the offset (ms) that moves "now" to 12:35 IST today, plus that instant in ISO form.
const IST = 330 * 60_000;
const real = Date.now();
const ist = new Date(real + IST);
let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 12, 35) - IST;
if (target < real - 6 * 3_600_000) target += 86_400_000;
console.log(`${target - real} ${new Date(target).toISOString()}`);
