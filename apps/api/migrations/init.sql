
CREATE TABLE users (
	id VARCHAR(64) NOT NULL, 
	name VARCHAR(60) NOT NULL, 
	email VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)


CREATE UNIQUE INDEX ix_users_email ON users (email)

CREATE TABLE wallets (
	id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	balance_cents INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)


CREATE UNIQUE INDEX ix_wallets_user_id ON wallets (user_id)

CREATE TABLE tournaments (
	id VARCHAR(64) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	entry_fee_cents INTEGER NOT NULL, 
	prize_pool_cents INTEGER NOT NULL, 
	max_players INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	bracket_type VARCHAR(40) NOT NULL, 
	bracket_state JSON, 
	platform_fee_percent INTEGER NOT NULL, 
	team_size INTEGER NOT NULL, 
	host_id VARCHAR(64), 
	tournament_type VARCHAR(20) NOT NULL, 
	password VARCHAR(64), 
	winner_id VARCHAR(64), 
	started_at DATETIME, 
	completed_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(host_id) REFERENCES users (id), 
	FOREIGN KEY(winner_id) REFERENCES users (id)
)



CREATE TABLE payments (
	id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	amount_cents INTEGER NOT NULL, 
	currency VARCHAR(10) NOT NULL, 
	provider VARCHAR(40) NOT NULL, 
	provider_order_id VARCHAR(120), 
	provider_payment_id VARCHAR(120), 
	provider_signature VARCHAR(255), 
	idempotency_key VARCHAR(120) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	is_test BOOLEAN NOT NULL, 
	metadata JSON, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (provider_order_id), 
	UNIQUE (idempotency_key)
)


CREATE INDEX ix_payments_user_id ON payments (user_id)

CREATE TABLE sessions (
	id VARCHAR(64) NOT NULL, 
	token VARCHAR(120) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)


CREATE INDEX ix_sessions_kind ON sessions (kind)
CREATE INDEX ix_sessions_user_id ON sessions (user_id)
CREATE UNIQUE INDEX ix_sessions_token ON sessions (token)

CREATE TABLE teams (
	id VARCHAR(64) NOT NULL, 
	tournament_id VARCHAR(64) NOT NULL, 
	name VARCHAR(120), 
	code VARCHAR(10), 
	PRIMARY KEY (id), 
	FOREIGN KEY(tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE, 
	UNIQUE (code)
)


CREATE INDEX ix_teams_tournament_id ON teams (tournament_id)

CREATE TABLE matches (
	id VARCHAR(64) NOT NULL, 
	tournament_id VARCHAR(64) NOT NULL, 
	round INTEGER NOT NULL, 
	match_order INTEGER NOT NULL, 
	player1_id VARCHAR(64), 
	player2_id VARCHAR(64), 
	winner_id VARCHAR(64), 
	room_code VARCHAR(80), 
	status VARCHAR(20) NOT NULL, 
	score_threshold INTEGER NOT NULL, 
	player1_score INTEGER NOT NULL, 
	player2_score INTEGER NOT NULL, 
	player1_submitted_score INTEGER, 
	player2_submitted_score INTEGER, 
	scores_approved BOOLEAN NOT NULL, 
	lifelines_used JSON, 
	result_meta JSON, 
	reschedules_remaining INTEGER NOT NULL, 
	scheduled_at DATETIME, 
	started_at DATETIME, 
	completed_at DATETIME, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE, 
	FOREIGN KEY(player1_id) REFERENCES users (id), 
	FOREIGN KEY(player2_id) REFERENCES users (id), 
	FOREIGN KEY(winner_id) REFERENCES users (id), 
	UNIQUE (room_code)
)


CREATE INDEX ix_matches_tournament_id ON matches (tournament_id)

CREATE TABLE wallet_transactions (
	id VARCHAR(64) NOT NULL, 
	wallet_id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	payment_id VARCHAR(64), 
	type VARCHAR(40) NOT NULL, 
	amount_cents INTEGER NOT NULL, 
	balance_after_cents INTEGER NOT NULL, 
	reference_type VARCHAR(40) NOT NULL, 
	reference_id VARCHAR(80) NOT NULL, 
	is_test BOOLEAN NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(wallet_id) REFERENCES wallets (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(payment_id) REFERENCES payments (id)
)


CREATE INDEX ix_wallet_transactions_user_id ON wallet_transactions (user_id)
CREATE INDEX ix_wallet_transactions_wallet_id ON wallet_transactions (wallet_id)

CREATE TABLE notifications (
	id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	type VARCHAR(40) NOT NULL, 
	title VARCHAR(120) NOT NULL, 
	message TEXT NOT NULL, 
	tournament_id VARCHAR(64), 
	match_id VARCHAR(64), 
	read BOOLEAN NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(tournament_id) REFERENCES tournaments (id)
)


CREATE INDEX ix_notifications_user_id ON notifications (user_id)

CREATE TABLE participants (
	id VARCHAR(64) NOT NULL, 
	tournament_id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	team_id VARCHAR(64), 
	status VARCHAR(20) NOT NULL, 
	seed INTEGER, 
	total_score INTEGER NOT NULL, 
	wins INTEGER NOT NULL, 
	losses INTEGER NOT NULL, 
	eliminated_in_round INTEGER, 
	joined_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_participants_tournament_user UNIQUE (tournament_id, user_id), 
	FOREIGN KEY(tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE SET NULL
)


CREATE INDEX ix_participants_user_id ON participants (user_id)
CREATE INDEX ix_participants_tournament_id ON participants (tournament_id)
