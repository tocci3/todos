let tasks = [];
let hideCompleted = true;
let showTimes = false;
let draggedTask = null;
let dropTarget = null;
let dropPosition = null;
let dragStartX = 0;

function dragStart(e) {
    draggedTask = e.target.closest('.task-item');
    e.dataTransfer.setData('text/plain', draggedTask.getAttribute('data-task-id'));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => draggedTask.classList.add('dragging'), 0);
    dragStartX = e.clientX;
}

function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const taskItem = e.target.closest('.task-item');
    if (taskItem && taskItem !== draggedTask) {
        const rect = taskItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const dragDistance = e.clientX - dragStartX;
        const currentDepth = parseInt(taskItem.getAttribute('data-depth'));

        resetDragStyles();
        
        if (e.clientY < midY) {
            taskItem.style.borderTop = '2px solid #666';
            dropPosition = 'before';
        } else {
            taskItem.style.borderBottom = '2px solid #666';
            dropPosition = 'after';
        }
        
        if (dragDistance > 30 && currentDepth < 10) { // 右にドラッグ（最大深さを制限）
            taskItem.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
            dropPosition += '-child';
        } else if (dragDistance < -30 && currentDepth > 0) { // 左にドラッグ（ルートレベルより浅くならないように）
            taskItem.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            dropPosition += '-parent';
        }
        
        dropTarget = taskItem;
    }
}

function dragLeave(e) {
    resetDragStyles();
}

function drop(e) {
    e.preventDefault();
    resetDragStyles();
    if (dropTarget && dropTarget !== draggedTask) {
        const draggedTaskId = parseInt(draggedTask.getAttribute('data-task-id'));
        const targetTaskId = parseInt(dropTarget.getAttribute('data-task-id'));
        moveTaskToNewPosition(draggedTaskId, targetTaskId, dropPosition);
    }
    draggedTask.classList.remove('dragging');
    draggedTask = null;
    dropTarget = null;
    dropPosition = null;
}

function resetDragStyles() {
    document.querySelectorAll('.task-item').forEach(item => {
        item.style.borderTop = '';
        item.style.borderBottom = '';
        item.style.backgroundColor = '';
    });
}

function moveTaskToNewPosition(draggedTaskId, targetTaskId, position) {
    const findAndRemoveTask = (taskList, parentList = null, depth = 0) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === draggedTaskId) {
                return { task: taskList.splice(i, 1)[0], parentList: parentList, depth: depth };
            }
            if (taskList[i].children.length > 0) {
                const found = findAndRemoveTask(taskList[i].children, taskList, depth + 1);
                if (found) return found;
            }
        }
        return null;
    };

    const insertTask = (taskList, task, position, depth) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === targetTaskId) {
                switch (position) {
                    case 'before':
                    case 'before-parent':
                        taskList.splice(i, 0, task);
                        return true;
                    case 'after':
                    case 'after-parent':
                        taskList.splice(i + 1, 0, task);
                        return true;
                    case 'before-child':
                    case 'after-child':
                        if (!taskList[i].children) taskList[i].children = [];
                        taskList[i].children[position === 'before-child' ? 'unshift' : 'push'](task);
                        return true;
                }
            }
            if (taskList[i].children && taskList[i].children.length > 0) {
                if (insertTask(taskList[i].children, task, position, depth + 1)) return true;
            }
        }
        return false;
    };

    const result = findAndRemoveTask(tasks);
    if (result) {
        const { task, parentList, depth } = result;
        let inserted = false;

        if (position.endsWith('-parent') && parentList) {
            const grandParentList = findParentList(tasks, parentList);
            if (grandParentList) {
                const parentIndex = grandParentList.findIndex(t => t.children === parentList);
                if (parentIndex !== -1) {
                    if (position === 'before-parent') {
                        grandParentList.splice(parentIndex, 0, task);
                    } else {
                        grandParentList.splice(parentIndex + 1, 0, task);
                    }
                    inserted = true;
                }
            }
        }

        if (!inserted) {
            inserted = insertTask(tasks, task, position, 0);
        }

        if (inserted) {
            saveTasks();
            renderTasks();
        }
    }
}

function findParentList(taskList, childList) {
    for (let task of taskList) {
        if (task.children === childList) {
            return taskList;
        }
        if (task.children && task.children.length > 0) {
            const found = findParentList(task.children, childList);
            if (found) return found;
        }
    }
    return null;
}

function loadTasks() {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
    }
    renderTasks();
}

function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

/*
function addTask(parentId = null) {
    const newTask = {
        id: Date.now(),
        title: "New task",
        status: 0,
        addedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        children: []
    };

    if (parentId === null) {
        tasks.push(newTask);
    } else {
        addChildTask(parentId, newTask);
    }

    saveTasks();
    renderTasks();

    // 新しく追加されたタスクにフォーカスを当てる
    setTimeout(() => {
        const newTaskElement = document.querySelector(`[data-task-id="${newTask.id}"] .task-title`);
        if (newTaskElement) {
            newTaskElement.focus();
        }
    }, 0);
}
*/
function addTask(parentId = null) {
    const newTaskInput = document.getElementById('newTask');
    const taskTitle = newTaskInput.value.trim();
    if (taskTitle === '' && parentId === null) return;

    const newTask = {
        id: Date.now(),
        title: parentId ? prompt("Enter subtask title:") : taskTitle,
        status: 0,
        addedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        children: []
    };

    if (newTask.title === null || newTask.title.trim() === '') return;

    if (parentId === null) {
        tasks.push(newTask);
        newTaskInput.value = ''; // 入力フィールドをクリア
    } else {
        addChildTask(parentId, newTask);
    }

    saveTasks();
    renderTasks();
}

function addChildTask(parentId, newTask) {
    const findAndAddChild = (taskList) => {
        for (let task of taskList) {
            if (task.id === parentId) {
                task.children.push(newTask);
                return true;
            }
            if (task.children.length > 0 && findAndAddChild(task.children)) {
                return true;
            }
        }
        return false;
    };

    findAndAddChild(tasks);
}

function deleteTask(taskId) {
    const deleteTaskRecursive = (taskList) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === taskId) {
                taskList.splice(i, 1);
                return true;
            }
            if (taskList[i].children.length > 0 && deleteTaskRecursive(taskList[i].children)) {
                return true;
            }
        }
        return false;
    };

    if (deleteTaskRecursive(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function cycleStatus(taskId) {
    const cycleStatusRecursive = (taskList) => {
        for (let task of taskList) {
            if (task.id === taskId) {
                const oldStatus = task.status;
                task.status = (task.status + 1) % 3;
                if (task.status === 1 && !task.startedAt) {
                    task.startedAt = new Date().toISOString();
                } else if (task.status === 2 && !task.completedAt) {
                    task.completedAt = new Date().toISOString();
                    completeChildren(task.children);
                } else if (task.status === 0) {
                    task.startedAt = null;
                    task.completedAt = null;
                }
                // タスクが完了状態になった場合のみ、子タスクも完了にする
                if (oldStatus !== 2 && task.status === 2) {
                    completeChildren(task.children);
                }
                return true;
            }
            if (task.children.length > 0 && cycleStatusRecursive(task.children)) {
                return true;
            }
        }
        return false;
    };

    if (cycleStatusRecursive(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function toggleHideCompleted() {
    hideCompleted = document.getElementById('hideCompleted').checked;
    saveSettings();
    renderTasks();
}

function toggleShowTimes() {
    showTimes = document.getElementById('showTimes').checked;
    saveSettings();
    renderTasks();
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
}

function renderTasks() {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    renderTaskTree(tasks, taskList, 0);
}

function renderTaskTree(taskList, parentElement, depth) {
    taskList.forEach(task => {
        if (hideCompleted && task.status === 2) {
            if (task.children.length > 0) {
                renderTaskTree(task.children, parentElement, depth);
            }
            return;
        }

        const li = document.createElement('li');
        li.className = 'task-item';
        li.draggable = true;
        li.setAttribute('data-task-id', task.id);
        li.setAttribute('data-depth', depth);
        
        let toggleButton = `<button class="toggle-btn" style="visibility: ${task.children.length > 0 ? 'visible' : 'hidden'}">▼</button>`;
        if (task.children.length > 0) {
            toggleButton = `<button class="toggle-btn" onclick="toggleChildren(${task.id})">▼</button>`;
        }

        li.innerHTML = `
            <div class="task-content" style="padding-left: ${depth * 20}px">
                ${toggleButton}
                <label class="custom-checkbox">
                    <input type="checkbox" ${task.status === 2 ? 'checked' : ''}
                           onclick="cycleStatus(${task.id})"
                           class="${task.status === 1 ? 'in-progress' : ''}">
                    <span class="checkmark"></span>
                </label>
                <span class="task-title" contenteditable="true" 
                      onblur="updateTaskTitle(${task.id}, this.textContent)"
                      onkeydown="handleTaskTitleKeyDown(event, ${task.id}, this)">${task.title}</span>
                ${showTimes ? `
                    <span class="task-times">
                        <span title="Add">📅${formatDate(task.addedAt)}</span>
                        ${task.startedAt ? `<span title="InProgress">🏁${formatDate(task.startedAt)}</span>` : ''}
                        ${task.completedAt ? `<span title="Done">✅${formatDate(task.completedAt)}</span>` : ''}
                    </span>
                ` : ''}
                <button onclick="addTask(${task.id})">+</button>
                <button onclick="deleteTask(${task.id})">Delete</button>
            </div>
        `;
        parentElement.appendChild(li);

        li.addEventListener('dragstart', dragStart);
        li.addEventListener('dragover', dragOver);
        li.addEventListener('drop', drop);
        li.addEventListener('dragleave', dragLeave);

        if (task.children.length > 0) {
            const childrenContainer = document.createElement('ul');
            childrenContainer.className = 'children-container';
            childrenContainer.id = `children-${task.id}`;
            childrenContainer.style.display = 'block'; // 初期状態では表示
            li.appendChild(childrenContainer);
            renderTaskTree(task.children, childrenContainer, depth + 1);
        }

        const taskTitleElement = li.querySelector('.task-title');
        taskTitleElement.addEventListener('keydown', (e) => handleTaskKeyPress(e, task.id));
    });
}

function handleTaskTitleKeyDown(event, taskId, element) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Shift+Enterの場合、デフォルトの改行を許可
            return;
        }
        // Enterのみの場合、編集を確定
        event.preventDefault();
        element.blur();
        updateTaskTitle(taskId, element.textContent);
    }
}

function updateTaskTitle(taskId, newTitle) {
    const updateTitleRecursive = (taskList) => {
        for (let task of taskList) {
            if (task.id === taskId) {
                task.title = newTitle.trim();
                return true;
            }
            if (task.children.length > 0 && updateTitleRecursive(task.children)) {
                return true;
            }
        }
        return false;
    };

    if (updateTitleRecursive(tasks)) {
        saveTasks();
        renderTasks(); // タスクリストを再描画して変更を反映
    }
}

function handleTaskKeyPress(event, taskId) {
    if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) {
            unindentTask(taskId);
        } else {
            indentTask(taskId);
        }
    }
}

function toggleChildren(taskId) {
    const childrenContainer = document.getElementById(`children-${taskId}`);
    const toggleBtn = childrenContainer.parentElement.querySelector('.toggle-btn');
    if (childrenContainer.style.display === 'none') {
        childrenContainer.style.display = 'block';
        toggleBtn.textContent = '▼';
    } else {
        childrenContainer.style.display = 'none';
        toggleBtn.textContent = '▶';
    }
}

function editTask(taskId) {
    const editTaskRecursive = (taskList) => {
        for (let task of taskList) {
            if (task.id === taskId) {
                const newTitle = prompt("Edit task", task.title);
                if (newTitle !== null && newTitle.trim() !== "") {
                    task.title = newTitle.trim();
                }
                return true;
            }
            if (task.children.length > 0 && editTaskRecursive(task.children)) {
                return true;
            }
        }
        return false;
    };

    if (editTaskRecursive(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function moveTaskUp(taskId) {
    moveTask(taskId, -1);
}

function moveTaskDown(taskId) {
    moveTask(taskId, 1);
}

function moveTask(taskId, direction) {
    const moveTaskInList = (taskList) => {
        const index = taskList.findIndex(task => task.id === taskId);
        if (index !== -1) {
            const newIndex = index + direction;
            if (newIndex >= 0 && newIndex < taskList.length) {
                const [removed] = taskList.splice(index, 1);
                taskList.splice(newIndex, 0, removed);
                return true;
            }
        }
        return taskList.some(task => task.children.length > 0 && moveTaskInList(task.children));
    };

    if (moveTaskInList(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function indentTask(taskId) {
    const indentTaskInList = (taskList, parentList = null) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === taskId) {
                if (i > 0) {
                    const task = taskList.splice(i, 1)[0];
                    if (!taskList[i - 1].children) {
                        taskList[i - 1].children = [];
                    }
                    taskList[i - 1].children.push(task);
                    return true;
                }
                return false;
            }
            if (taskList[i].children && taskList[i].children.length > 0) {
                if (indentTaskInList(taskList[i].children, taskList)) {
                    return true;
                }
            }
        }
        return false;
    };

    if (indentTaskInList(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function unindentTask(taskId) {
    const unindentTaskInList = (taskList, parentList = null, parentIndex = -1) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === taskId) {
                if (parentList) {
                    const task = taskList.splice(i, 1)[0];
                    parentList.splice(parentIndex + 1, 0, task);
                    return true;
                }
                return false;
            }
            if (taskList[i].children && taskList[i].children.length > 0) {
                if (unindentTaskInList(taskList[i].children, taskList, i)) {
                    return true;
                }
            }
        }
        return false;
    };

    if (unindentTaskInList(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function saveSettings() {
    localStorage.setItem('hideCompleted', JSON.stringify(hideCompleted));
    localStorage.setItem('showTimes', JSON.stringify(showTimes));
}

function loadSettings() {
    const savedHideCompleted = localStorage.getItem('hideCompleted');
    if (savedHideCompleted !== null) {
        hideCompleted = JSON.parse(savedHideCompleted);
    }
    document.getElementById('hideCompleted').checked = hideCompleted;

    const savedShowTimes = localStorage.getItem('showTimes');
    if (savedShowTimes !== null) {
        showTimes = JSON.parse(savedShowTimes);
    }
    document.getElementById('showTimes').checked = showTimes;
}

function updateParentTaskSelect() {
    const select = document.getElementById('parentTask');
    select.innerHTML = '<option value="root">ルート</option>';

    function addTaskOption(task, depth) {
        const option = document.createElement('option');
        option.value = task.id;
        option.textContent = '─'.repeat(depth) + ' ' + task.title;
        select.appendChild(option);

        task.children.forEach(child => addTaskOption(child, depth + 1));
    }

    tasks.forEach(task => addTaskOption(task, 0));
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        addTask();
    }
}

function completeTaskAndChildren(taskId) {
    const completeTaskRecursive = (taskList) => {
        for (let task of taskList) {
            if (task.id === taskId) {
                task.status = 2;
                task.completedAt = new Date().toISOString();
                completeChildren(task.children);
                return true;
            }
            if (task.children.length > 0 && completeTaskRecursive(task.children)) {
                return true;
            }
        }
        return false;
    };

    if (completeTaskRecursive(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function completeChildren(children) {
    for (let child of children) {
        child.status = 2;
        child.completedAt = new Date().toISOString();
        if (child.children.length > 0) {
            completeChildren(child.children);
        }
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadTasks();
});
