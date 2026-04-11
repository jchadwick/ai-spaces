import { getUserByEmail, createUser } from './user-store.js';
import { hashPassword } from './password-utils.js';

const ADMIN_EMAIL = 'admin';
const ADMIN_PASSWORD = 'ai-spaces';
const ADMIN_ROLE = 'admin';

export async function seedAdmin(): Promise<void> {
  const existing = getUserByEmail(ADMIN_EMAIL);
  
  if (existing) {
    console.log('Admin user already exists');
    return;
  }
  
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  
  const user = createUser(ADMIN_EMAIL, passwordHash, ADMIN_ROLE, 'Administrator');
  
  console.log('Admin user created:');
  console.log(`  Email: ${ADMIN_EMAIL}`);
  console.log(`  Role: ${ADMIN_ROLE}`);
  console.log(`  ID: ${user.id}`);
}