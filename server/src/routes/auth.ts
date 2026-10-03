import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { serializeProfile } from '../serialize.js';
import { ensureQuestSlots } from '../progress.js';
import { ensurePublicId } from '../publicId.js';

export const authRouter = Router();

const NICKNAME_RE = /^[a-zA-Z0-9_А-Яа-яЇїІіЄєҐґ]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post('/register', async (req, res) => {
  const { nickname, email, password } = req.body ?? {};
  if (typeof nickname !== 'string' || !NICKNAME_RE.test(nickname)) {
    res.status(400).json({ error: 'bad_nickname' });
    return;
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'bad_email' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'bad_password' });
    return;
  }

  const nicknameLower = nickname.toLowerCase();
  const emailLower = email.toLowerCase();
  const exists = await User.findOne({ $or: [{ nicknameLower }, { email: emailLower }] });
  if (exists) {
    res.status(409).json({ error: exists.nicknameLower === nicknameLower ? 'nickname_taken' : 'email_taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ nickname, nicknameLower, email: emailLower, passwordHash });
  await ensurePublicId(user);
  ensureQuestSlots(user);
  await user.save();

  const token = signToken(user._id.toString());
  res.status(201).json({ token, profile: serializeProfile(user) });
});

authRouter.post('/login', async (req, res) => {
  // вхід за нікнеймом або email (старі клієнти шлють поле email)
  const { login, email, password } = req.body ?? {};
  const id = typeof login === 'string' ? login.trim() : typeof email === 'string' ? email.trim() : '';
  if (!id || typeof password !== 'string') {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const lower = id.toLowerCase();
  const user = await User.findOne(lower.includes('@') ? { email: lower } : { nicknameLower: lower });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  user.lastLoginAt = new Date();
  ensureQuestSlots(user);
  await user.save();

  const token = signToken(user._id.toString());
  res.json({ token, profile: serializeProfile(user) });
});
