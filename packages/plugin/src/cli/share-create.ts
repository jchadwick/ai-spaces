import { createShare as createShareRecord } from '../share-store.js';

export async function createShare(spaceId: string, options: { role: string; expires: string }) {
  const role = options.role as 'viewer' | 'editor';
  if (role !== 'viewer' && role !== 'editor') {
    console.error(`Invalid role: ${options.role}. Must be 'viewer' or 'editor'.`);
    process.exit(1);
  }
  
  const match = options.expires.match(/^(\d+)([hd]?)$/);
  if (!match) {
    console.error(`Invalid duration: ${options.expires}. Use format like '7d' or '24h'.`);
    process.exit(1);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'd';
  const days = unit === 'h' ? value / 24 : value;
  
  const share = createShareRecord(spaceId, '', role, days > 0 ? days : undefined);
  
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3000';
  const shareUrl = `${gatewayUrl}/spaces/${spaceId}?t=${share.token}`;
  
  console.log('\nShare created:');
  console.log(`  ID: ${share.id}`);
  console.log(`  Role: ${share.role}`);
  console.log(`  URL: ${shareUrl}`);
  if (share.expires) {
    console.log(`  Expires: ${new Date(share.expires).toLocaleString()}`);
  } else {
    console.log('  Expires: Never');
  }
  console.log('');
}