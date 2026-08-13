import { prisma } from './shared/database/prisma-client.js';

function cleanText(str: any, max = 300) {
  if (!str) return '';
  return String(str).trim().slice(0, max);
}

function amount(val: any) {
  const num = Number(val);
  return Number.isNaN(num) || num < 0 ? 0 : num;
}

function parseDeliveryMethod(method: any) {
  if (!method) return 'viettelpost';
  const m = String(method).toLowerCase().trim();
  if (m.includes('grab')) return 'grab';
  if (m.includes('chanh') || m.includes('chành')) return 'chanh-xe';
  if (m.includes('nhan-tai-xuong') || m.includes('xưởng') || m.includes('tại xưởng')) return 'nhan-tai-xuong';
  return 'viettelpost';
}

function parsePaymentStatus(status: any) {
  if (!status) return 'unpaid';
  const s = String(status).toLowerCase().trim();
  if (s === 'paid' || s.includes('đã') || s.includes('đủ')) return 'paid';
  if (s === 'deposited' || s.includes('cọc')) return 'deposited';
  return 'unpaid';
}

function firebaseDatabaseBaseUrl(raw: string): string {
  const url = new URL(raw);
  const allowedHost = url.hostname.endsWith('.firebasedatabase.app')
    || url.hostname.endsWith('.firebaseio.com');
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password || url.search || url.hash) {
    throw new Error('FIREBASE_SYNC_DB_URL must be an HTTPS Firebase Realtime Database base URL');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

async function syncAll() {
  const fbApiKey = process.env.FIREBASE_SYNC_API_KEY;
  const fbEmail = process.env.FIREBASE_SYNC_EMAIL;
  const fbPassword = process.env.FIREBASE_SYNC_PASSWORD;
  const fbDbUrl = process.env.FIREBASE_SYNC_DB_URL;

  if (!fbApiKey || !fbEmail || !fbPassword || !fbDbUrl) {
    throw new Error(
      'Missing Firebase sync credentials. ' +
      'Set FIREBASE_SYNC_API_KEY, FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD, FIREBASE_SYNC_DB_URL in .env'
    );
  }

  console.log('Authenticating with Firebase Auth REST API...');
  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${fbApiKey}`;
  const authRes = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fbEmail, password: fbPassword, returnSecureToken: true })
  });
  if (!authRes.ok) throw new Error(`Auth failed: ${authRes.statusText}`);
  const authData: any = await authRes.json();
  const idToken = authData.idToken;
  console.log('Firebase auth token obtained!');

  const dbUrl = new URL(`${firebaseDatabaseBaseUrl(fbDbUrl)}/orders.json`);
  dbUrl.searchParams.set('auth', idToken);
  console.log('Fetching orders from Firebase RTDB...');
  const res = await fetch(dbUrl);
  if (!res.ok) throw new Error(`Fetch orders failed: ${res.statusText}`);

  const fbOrders = await res.json();
  if (!fbOrders) {
    console.log('No Firebase orders found.');
    process.exit(0);
  }

  const fbList = Object.entries(fbOrders).map(([id, o]: [string, any]) => ({ fbId: id, ...o }));
  console.log('Fetched Firebase orders count:', fbList.length);

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No Organization found in ZaloCRM');

  const adminUser = await prisma.user.findFirst({ where: { orgId: org.id, role: 'admin' } }) || await prisma.user.findFirst({ where: { orgId: org.id } });
  if (!adminUser) throw new Error('No User found in ZaloCRM');

  let inserted = 0;
  let updated = 0;

  for (const item of fbList) {
    const code = cleanText(item.orderCode, 100);
    if (!code) continue;

    const createdDate = item.createdDate ? new Date(Number(item.createdDate)) : new Date();
    const validCreatedDate = Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;

    const payload = {
      orderCode: code,
      productType: cleanText(item.productType, 50) || 'invitation',
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      totalAmount: amount(item.totalAmount),
      deposit: amount(item.deposit),
      codAmount: amount(item.codAmount),
      shippingFee: amount(item.shippingFee),
      paymentStatus: parsePaymentStatus(item.paymentStatus),
      deliveryMethod: parseDeliveryMethod(item.deliveryMethod),
      deliveryStatus: cleanText(item.deliveryStatus, 50) || 'pending',
      recipientName: cleanText(item.recipientName, 300),
      recipientPhone: cleanText(item.recipientPhone, 50),
      addressLine: cleanText(item.addressLine || item.address, 2000),
      carrierName: cleanText(item.carrierName, 100),
      trackingCode: cleanText(item.trackingCode, 100),
      trackingLink: cleanText(item.trackingLink, 500),
      notes: cleanText(item.notes, 2000),
      createdDate: validCreatedDate,
    };

    const existing = await prisma.deliveryOrder.findFirst({
      where: { orgId: org.id, orderCode: code, deletedAt: null }
    });

    if (existing) {
      await prisma.deliveryOrder.update({
        where: { id: existing.id },
        data: payload
      });
      updated++;
    } else {
      await prisma.deliveryOrder.create({
        data: {
          ...payload,
          orgId: org.id,
          createdById: adminUser.id,
        }
      });
      inserted++;
    }
  }

  console.log(`Sync Completed! Total: ${fbList.length}, Inserted: ${inserted}, Updated: ${updated}`);
  process.exit(0);
}

syncAll().catch(e => {
  console.error('Sync failed:', e);
  process.exit(1);
});
