import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{
 id:text('id').primaryKey(), owner:text('owner').notNull(), type:text('type').notNull(),
 courseId:text('course_id'), data:text('data').notNull(),
},t=>[index('records_owner').on(t.owner),index('records_course').on(t.owner,t.courseId)]);
export const credentials=sqliteTable('credentials',{
 owner:text('owner').primaryKey(), data:text('data').notNull(),
});
export const oauthStates=sqliteTable('oauth_states',{
 state:text('state').primaryKey(), owner:text('owner').notNull(), verifier:text('verifier').notNull(), expires:integer('expires').notNull(),
});
