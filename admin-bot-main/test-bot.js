const { loadStatus, loadWarnings, addWarning } = require('./utils/storage');
const { msUntil } = require('./handlers/prayerHandler');
const { checkViolation } = require('./utils/grokAI');
require('dotenv').config({ path: './.env' });

async function runTests() {
    console.log('🧪 Starting Bot Logic Tests...\n');

    // 1. Storage Test
    console.log('📂 Testing Storage...');
    const status = loadStatus();
    console.log('✅ Status loaded:', status);
    
    const warnings = loadWarnings();
    console.log('✅ Warnings loaded (count):', Object.keys(warnings).length);
    console.log('');

    // 2. Prayer Logic Test
    console.log('🕌 Testing Prayer Logic...');
    // Test msUntil with a fake time
    const fakeTime = '23:59';
    const ms = msUntil(fakeTime);
    if (ms > 0) {
        console.log(`✅ msUntil(${fakeTime}) calculated: ${ms}ms`);
    } else {
        console.log(`ℹ️ msUntil(${fakeTime}) is negative (already passed today)`);
    }
    console.log('');

    // 3. Grok AI Filter Test (Local)
    console.log('🤖 Testing Grok AI Local Filter...');
    const rudeTest = await checkViolation('anjing kamu');
    console.log('Test "anjing kamu" (Local):', rudeTest.is_violation ? '❌ Violation' : '✅ Safe', `(${rudeTest.reason})`);
    
    const safeTest = await checkViolation('Halo semuanya, apa kabar?');
    console.log('Test "Halo semuanya..." (Local):', safeTest.is_violation ? '❌ Violation' : '✅ Safe', `(${safeTest.reason})`);
    console.log('');

    // 4. API Connectivity Test (Optional)
    console.log('🌐 Testing API Connectivity (Grok AI)...');
    try {
        const apiTest = await checkViolation('Tolong jelaskan apa itu toleransi dalam 5 kata.');
        console.log('API Response:', apiTest);
        if (apiTest.reason === 'API error' || apiTest.reason.includes('GROK_API_KEY')) {
             console.log('⚠️ API test failed or skipped (check .env and GROK_API_KEY)');
        } else {
             console.log('✅ API test successful');
        }
    } catch (e) {
        console.log('❌ API test error:', e.message);
    }

    console.log('\n✨ Tests completed!');
}

runTests();
