'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const { hashPassword } = require('../utils/password');
const { generateAccountCode } = require('../utils/accountCode');

const Plan         = require('../models/Plan');
const Account      = require('../models/Account');
const Subscription = require('../models/Subscription');
const Settings     = require('../models/Settings');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set. Copy .env.example to .env and configure it.');
    process.exit(1);
  }

  const businessName = process.env.SEED_BUSINESS_NAME || 'My Business';
  const username     = (process.env.SEED_USERNAME || 'admin').toLowerCase();
  const password     = process.env.SEED_PASSWORD;

  if (!password || password.length < 8) {
    console.error('ERROR: SEED_PASSWORD must be set in .env and be at least 8 characters.');
    process.exit(1);
  }

  console.log('\n─── SwipeLedger Seed Script ───────────────────────────────');

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✓ Connected to MongoDB');

    // ── 1. Free Plan (upsert) ────────────────────────────────────────────────
    const plan = await Plan.findOneAndUpdate(
      { slug: 'free' },
      {
        $setOnInsert: {
          name: 'Free',
          slug: 'free',
          deviceLimit: parseInt(process.env.DEFAULT_DEVICE_LIMIT || '3', 10),
          transactionLimit: -1,
          features: [],
          price: 0,
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );
    console.log(`✓ Plan: ${plan.name} (${plan._id})`);

    // ── 2. Account ───────────────────────────────────────────────────────────
    const existing = await Account.findOne({ username, 'planId': plan._id });
    let account;

    if (existing) {
      console.log(`ℹ  Account already exists: ${existing.accountCode} / ${existing.username}`);
      account = existing;
    } else {
      const accountCode  = generateAccountCode();
      const passwordHash = await hashPassword(password);

      account = await Account.create({
        accountCode,
        username,
        passwordHash,
        businessName,
        planId: plan._id,
        deviceLimit: plan.deviceLimit,
        isActive: true,
        passwordChangedAt: new Date(),
      });
      console.log(`✓ Account created`);
      console.log(`  Account Code : ${account.accountCode}`);
      console.log(`  Username     : ${account.username}`);
      // Never log password — document shows where it comes from
      console.log(`  Password     : (from SEED_PASSWORD in .env)`);
    }

    // ── 3. Subscription ──────────────────────────────────────────────────────
    await Subscription.findOneAndUpdate(
      { accountId: account._id },
      {
        $setOnInsert: {
          accountId: account._id,
          planId: plan._id,
          status: 'active',
          currentPeriodStart: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    console.log(`✓ Subscription: active on Free plan`);

    // ── 4. Settings ──────────────────────────────────────────────────────────
    await Settings.findOneAndUpdate(
      { accountId: account._id },
      {
        $setOnInsert: {
          accountId: account._id,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          dateFormat: 'DD/MM/YYYY',
          defaultPaymentMode: 'cash',
        },
      },
      { upsert: true, new: true },
    );
    console.log(`✓ Settings: default preferences set`);

    console.log('\n─── Seed complete ──────────────────────────────────────────\n');
    console.log('Login credentials:');
    console.log(`  Account Code : ${account.accountCode}`);
    console.log(`  Username     : ${account.username}`);
    console.log(`  Password     : (from SEED_PASSWORD in .env)\n`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
