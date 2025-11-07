-- 목록저장 기능을 위한 saved_music 테이블 생성
CREATE TABLE IF NOT EXISTS saved_music (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    music_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
    UNIQUE KEY unique_save (user_id, music_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX idx_user_id ON saved_music(user_id);
CREATE INDEX idx_music_id ON saved_music(music_id);
CREATE INDEX idx_created_at ON saved_music(created_at);