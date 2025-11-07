// Firestore 데이터 확인 스크립트
import admin from 'firebase-admin';

// Firebase Admin 초기화
admin.initializeApp({
  projectId: 'pixelplanet-95dd9'
});

const db = admin.firestore();

async function checkFirestoreData() {
  try {
    console.log('=== Firestore 데이터 확인 ===\n');

    // 1. Categories 컬렉션 확인
    console.log('📁 Categories 컬렉션:');
    const categoriesSnapshot = await db.collection('categories').get();

    if (categoriesSnapshot.empty) {
      console.log('   ⚠️  카테고리가 없습니다.\n');
    } else {
      console.log(`   총 ${categoriesSnapshot.size}개의 카테고리\n`);
      categoriesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}`);
        console.log(`     분류: ${data.classification || '미분류'}`);
        console.log('');
      });
    }

    // 2. Music 컬렉션 확인 (샘플 10개)
    console.log('🎵 Music 컬렉션 (샘플 10개):');
    const musicSnapshot = await db.collection('music').limit(10).get();

    if (musicSnapshot.empty) {
      console.log('   ⚠️  음악이 없습니다.\n');
    } else {
      const totalMusicSnapshot = await db.collection('music').count().get();
      console.log(`   총 ${totalMusicSnapshot.data().count}개의 음악\n`);

      musicSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}`);
        console.log(`     이름: ${data.name || data.title || '제목없음'}`);
        console.log(`     카테고리: ${data.category || '없음'}`);
        console.log(`     추천: ${data.recommended ? '예' : '아니오'}`);
        console.log('');
      });
    }

    // 3. 모든 고유 카테고리 찾기
    console.log('📊 음악에서 사용 중인 모든 카테고리:');
    const allMusicSnapshot = await db.collection('music').get();
    const categoriesInUse = new Set();
    const categoryCount = {};

    allMusicSnapshot.forEach(doc => {
      const category = doc.data().category;
      if (category) {
        categoriesInUse.add(category);
        categoryCount[category] = (categoryCount[category] || 0) + 1;
      }
    });

    if (categoriesInUse.size === 0) {
      console.log('   ⚠️  카테고리가 설정된 음악이 없습니다.\n');
    } else {
      Array.from(categoriesInUse).sort().forEach(cat => {
        console.log(`   - ${cat}: ${categoryCount[cat]}개 음악`);
      });
    }

  } catch (error) {
    console.error('❌ 에러:', error);
  } finally {
    process.exit(0);
  }
}

checkFirestoreData();
