import bcrypt from 'bcryptjs';

const COST = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Constant-ish time dummy compare to avoid user enumeration via timing. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);
export const dummyVerify = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);
