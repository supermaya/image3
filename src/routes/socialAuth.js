import express from 'express';
import axios from 'axios';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import admin from 'firebase-admin';

const router = express.Router();

// ── Firebase Admin 초기화 (Custom Token 생성용) ───────────────────────────────
// 이미 초기화되어 있으면 기존 인스턴스 사용
function getAdminApp() {
    if (admin.apps.length) return admin.apps[0];
    // 환경변수에 서비스 계정이 없으면 기본 앱으로 초기화 (에뮬레이터용)
    return admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

// Firestore에 소셜 사용자 문서 upsert
async function upsertSocialUser({ uid, email, displayName, photoURL, provider }) {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            email: email || '',
            displayName: displayName || '',
            photoURL: photoURL || '',
            role: 'user',
            provider,
            createdAt: serverTimestamp(),
            dailyPoints: 0,
            walletBalance: 0,
        });
    }
}

// ────────────────────────────────────────────────
// DISCORD OAuth2
// GET /api/auth/discord  → Discord 인증 페이지로 리다이렉트
// ────────────────────────────────────────────────
router.get('/discord', (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify email',
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// GET /api/auth/discord/callback
router.get('/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.CORS_ORIGIN}?auth_error=discord_no_code`);

    try {
        // 1. code → access_token
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token } = tokenRes.data;

        // 2. 사용자 정보 조회
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const discordUser = userRes.data;

        const uid = `discord_${discordUser.id}`;
        const email = discordUser.email || `${discordUser.id}@discord.fake`;
        const displayName = discordUser.global_name || discordUser.username;
        const photoURL = discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : '';

        // 3. Firestore upsert
        await upsertSocialUser({ uid, email, displayName, photoURL, provider: 'discord' });

        // 4. Firebase Custom Token 발급
        const adminApp = getAdminApp();
        const customToken = await adminApp.auth().createCustomToken(uid, { provider: 'discord' });

        // 5. 클라이언트로 토큰 전달 (postMessage 방식)
        res.send(`
            <script>
                window.opener?.postMessage({ type: 'social_auth', provider: 'discord', customToken: '${customToken}' }, '${process.env.CORS_ORIGIN}');
                window.close();
            </script>
        `);
    } catch (err) {
        console.error('[Discord OAuth]', err.response?.data || err.message);
        res.redirect(`${process.env.CORS_ORIGIN}?auth_error=discord_failed`);
    }
});

// ────────────────────────────────────────────────
// LINE OAuth2
// GET /api/auth/line  → Line 인증 페이지로 리다이렉트
// ────────────────────────────────────────────────
router.get('/line', (req, res) => {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.LINE_CHANNEL_ID,
        redirect_uri: process.env.LINE_REDIRECT_URI,
        state: Math.random().toString(36).slice(2),
        scope: 'profile openid email',
    });
    res.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
});

// GET /api/auth/line/callback
router.get('/line/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.CORS_ORIGIN}?auth_error=line_no_code`);

    try {
        // 1. code → access_token
        const tokenRes = await axios.post('https://api.line.me/oauth2/v2.1/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.LINE_REDIRECT_URI,
                client_id: process.env.LINE_CHANNEL_ID,
                client_secret: process.env.LINE_CHANNEL_SECRET,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token } = tokenRes.data;

        // 2. 프로필 조회
        const profileRes = await axios.get('https://api.line.me/v2/profile', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const lineUser = profileRes.data;

        const uid = `line_${lineUser.userId}`;
        const displayName = lineUser.displayName || '';
        const photoURL = lineUser.pictureUrl || '';

        await upsertSocialUser({ uid, email: '', displayName, photoURL, provider: 'line' });

        const adminApp = getAdminApp();
        const customToken = await adminApp.auth().createCustomToken(uid, { provider: 'line' });

        res.send(`
            <script>
                window.opener?.postMessage({ type: 'social_auth', provider: 'line', customToken: '${customToken}' }, '${process.env.CORS_ORIGIN}');
                window.close();
            </script>
        `);
    } catch (err) {
        console.error('[Line OAuth]', err.response?.data || err.message);
        res.redirect(`${process.env.CORS_ORIGIN}?auth_error=line_failed`);
    }
});

// ────────────────────────────────────────────────
// KAKAO OAuth2
// POST /api/auth/kakao  → 클라이언트에서 access_token 전달
// ────────────────────────────────────────────────
router.post('/kakao', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ success: false, message: 'access_token 없음' });

    try {
        // 카카오 사용자 정보 조회
        const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const kakaoUser = userRes.data;
        const kakaoAccount = kakaoUser.kakao_account || {};
        const profile = kakaoAccount.profile || {};

        const uid = `kakao_${kakaoUser.id}`;
        const email = kakaoAccount.email || `${kakaoUser.id}@kakao.fake`;
        const displayName = profile.nickname || '';
        const photoURL = profile.profile_image_url || '';

        await upsertSocialUser({ uid, email, displayName, photoURL, provider: 'kakao' });

        const adminApp = getAdminApp();
        const customToken = await adminApp.auth().createCustomToken(uid, { provider: 'kakao' });

        res.json({ success: true, customToken });
    } catch (err) {
        console.error('[Kakao OAuth]', err.response?.data || err.message);
        res.status(500).json({ success: false, message: '카카오 인증 실패' });
    }
});

export default router;
