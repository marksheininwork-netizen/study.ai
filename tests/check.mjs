import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.split('<script>')[1]?.split('</script>')[0];

assert.ok(script, 'application script exists');
new Script(script, { filename: 'mindspark.js' });
assert.ok(html.includes('<meta name="viewport"'), 'responsive viewport is configured');
assert.ok(html.includes('@media(max-width:650px)'), 'mobile layout exists');
assert.ok(html.includes('prefers-reduced-motion'), 'reduced-motion preference is supported');

for (const label of [
  'Study AI', 'QuizArena', 'FlashcardLab', 'MathBattle',
  'EssayCoach', 'FocusRoom', 'Competition Academy', 'Educational Games',
]) assert.ok(html.includes(label), label + ' is present');

for (const feature of [
  'taskForm', 'cardForm', 'mathForm', 'gameForm', 'reviewEssay',
  'focusSessions', 'quizHistory', 'academyHistory', 'localStorage',
  'mindspark-learning-v1', 'exportData',
]) assert.ok(script.includes(feature), feature + ' is implemented');

assert.ok(html.includes('Your text is analyzed in this browser and is not sent to an AI service'),
  'essay feedback disclosure exists');
assert.ok(html.includes('No account or billing required'), 'guest and billing status are clear');
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.ok(!script.includes(forbidden), 'student data stays local (' + forbidden + ')');
}

const ids = [...html.matchAll(new RegExp('id="([^"]+)"', 'g'))].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'element IDs are unique');
assert.ok(script.includes('a:["5 cm","6 cm","7 cm","12 cm"],correct:1'),
  'competition geometry answer key matches the 6 cm choice');

console.log('MindSpark structural and JavaScript syntax checks passed');
