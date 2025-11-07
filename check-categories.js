// Firestore 카테고리 확인 스크립트
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Service Account Key 로드
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'pixelplanet-95dd9'
});

const db = admin.firestore();

async function checkCategories() {
  try {
    console.log('=== Firestore 카테고리 확인 ===\n');

    // Categories 컬렉션 확인
    const categoriesSnapshot = await db.collection('categories').get();

    if (categoriesSnapshot.empty) {
      console.log('⚠️  카테고리가 없습니다.\n');
    } else {
      console.log(`✅ 총 ${categoriesSnapshot.size}개의 카테고리\n`);
      categoriesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`📁 카테고리: ${doc.id}`);
        console.log(`   - topSection: ${data.topSection || '없음'}`);
        console.log(`   - classification: ${data.classification || '미분류'}`);
        console.log(`   - isAdult: ${data.isAdult || false}`);
        console.log('');
      });
    }

    // topSection별 통계
    const bySectionCounts = { 'visual-mode': 0, 'momentary': 0, 'chronicles': 0 };
    categoriesSnapshot.forEach(doc => {
      const section = doc.data().topSection || 'visual-mode';
      if (bySectionCounts[section] !== undefined) {
        bySectionCounts[section]++;
      }
    });

    console.log('📊 섹션별 카테고리 수:');
    console.log(`   - VISUAL MODE: ${bySectionCounts['visual-mode']}개`);
    console.log(`   - MOMENTARY: ${bySectionCounts['momentary']}개`);
    console.log(`   - CHRONICLES: ${bySectionCounts['chronicles']}개\n`);

    // 음악 데이터 확인
    console.log('=== Music 데이터 확인 ===\n');
    const musicSnapshot = await db.collection('music').get();

    if (musicSnapshot.empty) {
      console.log('⚠️  음악이 없습니다.\n');
    } else {
      console.log(`✅ 총 ${musicSnapshot.size}개의 음악\n`);

      // 카테고리별 음악 수 집계
      const musicByCategory = {};
      musicSnapshot.forEach(doc => {
        const data = doc.data();
        const category = data.category || '미분류';
        if (!musicByCategory[category]) {
          musicByCategory[category] = [];
        }
        musicByCategory[category].push({
          id: doc.id,
          name: data.name || data.title || '제목없음',
          topSection: data.topSection || '없음'
        });
      });

      console.log('📊 카테고리별 음악 수:');
      Object.keys(musicByCategory).sort().forEach(cat => {
        const count = musicByCategory[cat].length;
        const firstMusic = musicByCategory[cat][0];
        console.log(`   - ${cat}: ${count}개`);
        if (firstMusic.topSection) {
          console.log(`     topSection: ${firstMusic.topSection}`);
        }
      });

      console.log('\n🔍 MOMENTARY 카테고리의 음악:');
      const momentaryCategories = ['Daily Scenes', 'Dream Snapshots', 'Fragments of Time', 'Intimate Moments', 'Urban Pulse'];
      momentaryCategories.forEach(cat => {
        if (musicByCategory[cat]) {
          console.log(`   - ${cat}: ${musicByCategory[cat].length}개`);
        } else {
          console.log(`   - ${cat}: 0개 ⚠️`);
        }
      });
    }

  } catch (error) {
    console.error('❌ 에러:', error);
  } finally {
    process.exit(0);
  }
}

checkCategories();
