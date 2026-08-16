'use strict';

const { hashPassword } = require('../../server/utils/password');
const { generateAccountCode } = require('../../server/utils/accountCode');
const Account      = require('../../server/models/Account');
const Plan         = require('../../server/models/Plan');
const Subscription = require('../../server/models/Subscription');
const Settings     = require('../../server/models/Settings');

const TEST_PASSWORD = 'TestPassword123!';

/**
 * Create a complete account with plan, subscription, and settings.
 * Returns { account, plan, subscription, settings, plainPassword }
 */
async function createTestAccount(overrides = {}) {
  const plan = await Plan.findOneAndUpdate(
    { slug: 'free' },
    {
      $setOnInsert: {
        name: 'Free', slug: 'free', deviceLimit: 3,
        transactionLimit: -1, features: [], price: 0, isActive: true,
      },
    },
    { upsert: true, new: true },
  );

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const accountCode  = overrides.accountCode || generateAccountCode();
  const username     = overrides.username || 'testadmin';

  const account = await Account.create({
    accountCode,
    username,
    passwordHash,
    businessName: overrides.businessName || 'Test Business',
    planId: plan._id,
    deviceLimit: overrides.deviceLimit || plan.deviceLimit,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    passwordChangedAt: new Date(),
  });

  const subscription = await Subscription.create({
    accountId: account._id,
    planId: plan._id,
    status: 'active',
    currentPeriodStart: new Date(),
  });

  const settings = await Settings.create({
    accountId: account._id,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    defaultPaymentMode: 'cash',
  });

  return { account, plan, subscription, settings, plainPassword: TEST_PASSWORD };
}

module.exports = { createTestAccount, TEST_PASSWORD };
