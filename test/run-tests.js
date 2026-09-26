const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = process.env.TODOS_PROJECT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
let passed = 0;
let failed = 0;

function createApp() {
  const values = new Map();
  const elements = new Map();
  const document = {
    activeElement: { classList: { contains: () => false }, isContentEditable: false },
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, { value: '', checked: false, style: {}, classList: {
          add() {}, remove() {}, contains() { return false; }
        } });
      }
      return elements.get(id);
    }
  };
  const context = vm.createContext({
    document,
    window: {},
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    console,
    alert() {},
    prompt() { return ''; },
    setTimeout() {}
  });
  vm.runInContext(source, context, { filename: 'script.js' });
  vm.runInContext('renderTasks = function() {}; selectTask = function() {};', context);
  return { context, elements, values };
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error);
  }
}

function evaluate(context, expression) {
  return vm.runInContext(expression, context);
}

test('parses indented text into a nested task tree', () => {
  const { context } = createApp();
  const tasks = evaluate(context,
    "textToTasks('Parent\\n  Child\\n    Grandchild\\nSibling', 'spaces')");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tasks)).map(task => task.title), ['Parent', 'Sibling']);
  assert.strictEqual(tasks[0].children[0].title, 'Child');
  assert.strictEqual(tasks[0].children[0].children[0].title, 'Grandchild');
});

test('exports nested tasks in each supported text format', () => {
  const { context } = createApp();
  evaluate(context, `tasks = [
    { title: 'Parent', children: [{ title: 'Child', children: [{ title: 'Grandchild', children: [] }] }] },
    { title: 'Sibling', children: [] }
  ]`);
  assert.strictEqual(evaluate(context, "exportTasks('spaces')"),
    'Parent\n  Child\n    Grandchild\nSibling\n');
  assert.strictEqual(evaluate(context, "exportTasks('asterisks')"),
    '* Parent\n  * Child\n    * Grandchild\n* Sibling\n');
  assert.strictEqual(evaluate(context, "exportTasks('dashes')"),
    '- Parent\n  - Child\n    - Grandchild\n- Sibling\n');
  assert.deepStrictEqual(JSON.parse(evaluate(context, "exportTasks('json')")),
    JSON.parse(JSON.stringify(evaluate(context, 'tasks'))));
});

test('assigns imported task IDs above the existing maximum, including descendants', () => {
  const { context } = createApp();
  evaluate(context, `tasks = [{ id: 8, children: [{ id: 12, children: [] }] }]`);
  evaluate(context, `const imported = [
    { id: 999, children: [{ id: 999, children: [] }] },
    { id: 999, children: [] }
  ]; updateTaskIds(imported); globalThis.importedForTest = imported;`);
  const ids = JSON.parse(evaluate(context,
    'JSON.stringify([importedForTest[0].id, importedForTest[0].children[0].id, importedForTest[1].id])'));
  assert.deepStrictEqual(ids, [13, 14, 15]);
});

test('cycles a task from not started to in progress and saves its start time', () => {
  const { context, values } = createApp();
  evaluate(context, `tasks = [{ id: 1, title: 'Task', status: 0, startedAt: null,
    completedAt: null, children: [] }]`);
  evaluate(context, 'cycleStatus(1)');
  const task = JSON.parse(evaluate(context, 'JSON.stringify(tasks[0])'));
  assert.strictEqual(task.status, 1);
  assert.ok(task.startedAt);
  assert.strictEqual(task.completedAt, null);
  assert.strictEqual(JSON.parse(values.get('tasks'))[0].status, 1);
});

test('completing a parent also completes all descendants', () => {
  const { context } = createApp();
  evaluate(context, `tasks = [{ id: 1, title: 'Parent', status: 1, children: [
    { id: 2, title: 'Child', status: 0, children: [
      { id: 3, title: 'Grandchild', status: 0, children: [] }
    ] }
  ] }]`);
  evaluate(context, 'cycleStatus(1)');
  const statuses = JSON.parse(evaluate(context,
    'JSON.stringify([tasks[0].status, tasks[0].children[0].status, tasks[0].children[0].children[0].status])'));
  assert.deepStrictEqual(statuses, [2, 2, 2]);
  assert.ok(evaluate(context, 'tasks[0].completedAt'));
  assert.ok(evaluate(context, 'tasks[0].children[0].children[0].completedAt'));
});

test('can add a child after unindenting a parent’s last child', () => {
  const { context } = createApp();
  context.prompt = () => 'New child';
  evaluate(context, `tasks = [{ id: 1, title: 'Parent', children: [
    { id: 2, title: 'Old child', children: [] }
  ] }]`);
  evaluate(context, 'unindentTask(2)');
  evaluate(context, 'addTask(1)');
  const childTitle = evaluate(context, 'tasks[0].children[0].title');
  assert.strictEqual(childTitle, 'New child');
});

test('can reorder nested tasks when another node has no children array', () => {
  const { context } = createApp();
  evaluate(context, `tasks = [
    { id: 1, title: 'Legacy leaf' },
    { id: 2, title: 'Parent', children: [
      { id: 3, title: 'First child', children: [] },
      { id: 4, title: 'Second child', children: [] }
    ] }
  ]`);
  evaluate(context, 'moveTask(3, 1)');
  const childIds = JSON.parse(evaluate(context, 'JSON.stringify(tasks[1].children.map(task => task.id))'));
  assert.deepStrictEqual(childIds, [4, 3]);
});

test('keeps task IDs unique when several tasks are added in the same millisecond', () => {
  const { context } = createApp();
  const input = context.document.getElementById('newTask');
  vm.runInContext('Date.now = () => 12345', context);
  input.value = 'First';
  evaluate(context, 'addTask()');
  input.value = 'Second';
  evaluate(context, 'addTask()');
  const ids = JSON.parse(evaluate(context, 'JSON.stringify(tasks.map(task => task.id))'));
  assert.deepStrictEqual(ids, [12345, 12346]);
});

test('does not lose a task when asked to move it under its own descendant', () => {
  const { context } = createApp();
  evaluate(context, `tasks = [{ id: 1, title: 'Parent', children: [
    { id: 2, title: 'Child', children: [] }
  ] }]`);
  evaluate(context, "moveTaskToNewPosition(1, 2, 'after-child')");
  const ids = JSON.parse(evaluate(context,
    'JSON.stringify([tasks[0].id, tasks[0].children[0].id])'));
  assert.deepStrictEqual(ids, [1, 2]);
});

test('clears drag styling and state when a drag ends without a valid move', () => {
  const { context } = createApp();
  let removedDraggingClass = false;
  context.testDraggedNode = {
    classList: { remove(name) { removedDraggingClass = name === 'dragging'; } }
  };
  evaluate(context, 'draggedTask = testDraggedNode; dropTarget = null; dropPosition = null');
  evaluate(context, 'dragEnd()');
  assert.strictEqual(removedDraggingClass, true);
  assert.strictEqual(evaluate(context, 'draggedTask'), null);
  assert.strictEqual(evaluate(context, 'dropTarget'), null);
  assert.strictEqual(evaluate(context, 'dropPosition'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
