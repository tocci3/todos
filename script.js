let tasks = [];
let hideCompleted = true;
let showTimes = false;
let draggedTask = null;
let dropTarget = null;
let dropPosition = null;
let dragStartX = 0;
let importedTasksTemp = null;
let selectedTaskIds = new Set();
let lastSelectedTaskId = null;

function handleKeyDown(event) {
    const activeElement = document.activeElement;
    const isEditing = activeElement.classList.contains('task-title') && activeElement.isContentEditable;

    if (isEditing) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            // 編集中の場合、編集を確定してから移動
            event.preventDefault();
            const taskId = parseInt(activeElement.getAttribute('data-task-id'));
            const task = findTaskById(taskId);
            if (task) {
                const newTitle = activeElement.textContent.trim();
                if (newTitle !== task.title) {
                    updateTaskTitle(taskId, newTitle);
                }
            }
            activeElement.blur();
            setTimeout(() => {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }, 0);
            moveSelection(event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'Tab') {
            event.preventDefault();
            if (event.shiftKey) {
                unindentTask(parseInt(activeElement.getAttribute('data-task-id')));
            } else {
                indentTask(parseInt(activeElement.getAttribute('data-task-id')));
            }
        } else if (event.key === 'Enter' && !event.shiftKey) {
            // Enterキーで編集を確定
            event.preventDefault();
            const taskId = parseInt(activeElement.getAttribute('data-task-id'));
            const task = findTaskById(taskId);
            if (task) {
                const newTitle = activeElement.textContent.trim();
                if (newTitle !== task.title) {
                    updateTaskTitle(taskId, newTitle);
                }
            }
            activeElement.blur();
        } else if (event.key === 'Escape') {
            // Escキーで編集をキャンセル
            event.preventDefault();
            cancelEdit(activeElement);
        }
    } else {
        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                if (event.shiftKey) {
                    extendSelectionUp();
                } else {
                    moveSelection(-1);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (event.shiftKey) {
                    extendSelectionDown();
                } else {
                    moveSelection(1);
                }
                break;
            case 'ArrowRight':
                event.preventDefault();
                expandSelectedTask();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                collapseSelectedTask();
                break;
            case 'Enter':
                if (event.target.id !== 'newTask') {
                    event.preventDefault();
                    enterEditMode();
                }
                break;
            case 'Tab':
                event.preventDefault();
                if (event.shiftKey) {
                    unindentSelectedTasks();
                } else {
                    indentSelectedTasks();
                }
                break;
            case ' ': // スペースキー
                event.preventDefault();
                cycleSelectedTasksStatus();
                break;
        }
    }
}

function cycleSelectedTasksStatus() {
    const selectedTasks = Array.from(selectedTaskIds).map(id => findTaskById(id));
    if (selectedTasks.length === 0) return;

    selectedTasks.forEach(task => {
        if (task) {
            task.status = (task.status + 1) % 3;
            updateTaskTimes(task);
        }
    });

    saveTasks();
    renderTasks();
    updateTaskSelection();
}

function updateTaskTimes(task) {
    const now = new Date().toISOString();
    switch (task.status) {
        case 1: // In Progress
            if (!task.startedAt) task.startedAt = now;
            break;
        case 2: // Completed
            if (!task.completedAt) task.completedAt = now;
            break;
        case 0: // Not Started
            task.startedAt = null;
            task.completedAt = null;
            break;
    }
}

function extendSelectionDown() {
    const allTasks = getAllTasksFlattened();
    const visibleTasks = allTasks.filter(task => isTaskVisible(task));

    if (visibleTasks.length === 0 || selectedTaskIds.size === 0) return;

    const lowerTaskId = findLowerVisibleTaskId(visibleTasks);
    if (lowerTaskId === null) return;

    const lowerTask = visibleTasks.find(task => task.id === lowerTaskId);
    const highestSelectedTask = findHighestSelectedTask(visibleTasks);

    if (getTaskDepth(lowerTask) > getTaskDepth(highestSelectedTask)) {
        // 下位レベルのタスクを選択する場合
        selectTaskWithDescendantsAndNextSiblings(lowerTask);
    } else if (getTaskDepth(lowerTask) < getTaskDepth(highestSelectedTask)) {
        // 上位レベルのタスクを選択する場合
        const ancestorAtSameLevel = findAncestorAtSameLevel(highestSelectedTask, getTaskDepth(lowerTask));
        if (ancestorAtSameLevel) {
            selectTasksInRange(ancestorAtSameLevel, lowerTask);
        } else {
            selectTaskWithDescendants(lowerTask);
        }
    } else {
        // 同じレベルのタスクを選択する場合
        selectedTaskIds.add(lowerTaskId);
    }

    lastSelectedTaskId = lowerTaskId;
    updateTaskSelection();
    scrollToTask(lowerTaskId);
}

function selectTasksInRange(startTask, endTask) {
    const allTasks = getAllTasksFlattened();
    let selecting = false;
    for (const task of allTasks) {
        if (task.id === startTask.id) {
            selecting = true;
        }
        if (selecting) {
            selectedTaskIds.add(task.id);
        }
        if (task.id === endTask.id) {
            break;
        }
    }
}

function findLowerVisibleTaskId(visibleTasks) {
    const selectedIndices = Array.from(selectedTaskIds)
        .map(id => visibleTasks.findIndex(task => task.id === id))
        .filter(index => index !== -1)
        .sort((a, b) => b - a);

    if (selectedIndices.length === 0 || selectedIndices[0] === visibleTasks.length - 1) {
        return null;
    }

    return visibleTasks[selectedIndices[0] + 1].id;
}

function findHighestSelectedTask(visibleTasks) {
    const selectedIndices = Array.from(selectedTaskIds)
        .map(id => visibleTasks.findIndex(task => task.id === id))
        .filter(index => index !== -1)
        .sort((a, b) => a - b);

    return visibleTasks[selectedIndices[0]];
}

function selectTaskWithDescendantsAndNextSiblings(task) {
    const taskWithDescendants = getTaskWithDescendants(task);
    taskWithDescendants.forEach(t => selectedTaskIds.add(t.id));

    const parentTask = findParentTask(task.id);
    if (parentTask) {
        const siblings = parentTask.children;
        const taskIndex = siblings.findIndex(sibling => sibling.id === task.id);
        for (let i = taskIndex + 1; i < siblings.length; i++) {
            selectedTaskIds.add(siblings[i].id);
        }
    }
}

function findAncestorAtSameLevel(task, targetDepth) {
    let currentTask = task;
    let currentDepth = getTaskDepth(task);

    while (currentDepth > targetDepth) {
        const parent = findParentTask(currentTask.id);
        if (!parent) return null;
        currentTask = parent;
        currentDepth--;
    }

    return currentTask;
}

function extendSelectionUp() {
    const allTasks = getAllTasksFlattened();
    const visibleTasks = allTasks.filter(task => isTaskVisible(task));

    if (visibleTasks.length === 0 || selectedTaskIds.size === 0) return;

    const upperTaskId = findUpperVisibleTaskId(visibleTasks);
    if (upperTaskId === null) return;

    const upperTask = visibleTasks.find(task => task.id === upperTaskId);
    const lowestSelectedTask = findLowestSelectedTask(visibleTasks);

    if (getTaskDepth(upperTask) < getTaskDepth(lowestSelectedTask)) {
        // 上位レベルのタスクを選択する場合
        selectTaskWithDescendants(upperTask);
    } else if (getTaskDepth(upperTask) > getTaskDepth(lowestSelectedTask)) {
        // 下位レベルのタスクを選択する場合
        const parentTask = findParentTask(upperTask.id);
        if (parentTask) {
            selectTaskWithDescendants(parentTask);
        } else {
            selectTaskWithDescendants(upperTask);
        }
    } else {
        // 同じレベルまたは下位レベルのタスクを選択する場合
        selectedTaskIds.add(upperTaskId);
    }

    lastSelectedTaskId = upperTaskId;
    updateTaskSelection();
    scrollToTask(upperTaskId);
}

function selectTaskWithDescendants(task) {
    const taskWithDescendants = getTaskWithDescendants(task);
    taskWithDescendants.forEach(t => selectedTaskIds.add(t.id));
}

function getTaskWithDescendants(task) {
    const result = [task];
    if (task.children && task.children.length > 0) {
        task.children.forEach(child => {
            result.push(...getTaskWithDescendants(child));
        });
    }
    return result;
}

function findParentTask(taskId, taskList = tasks) {
    for (const task of taskList) {
        if (task.children && task.children.some(child => child.id === taskId)) {
            return task;
        }
        if (task.children) {
            const parent = findParentTask(taskId, task.children);
            if (parent) return parent;
        }
    }
    return null;
}

function findLowestSelectedTask(visibleTasks) {
    const selectedIndices = Array.from(selectedTaskIds)
        .map(id => visibleTasks.findIndex(task => task.id === id))
        .filter(index => index !== -1)
        .sort((a, b) => b - a);

    return visibleTasks[selectedIndices[0]];
}

function getTaskDepth(task) {
    let depth = 0;
    let currentTask = task;
    while (findParentTask(currentTask.id)) {
        depth++;
        currentTask = findParentTask(currentTask.id);
    }
    return depth;
}

function selectFirstVisibleTask() {
    const allTasks = getAllTasksFlattened();
    const firstVisibleTask = allTasks.find(task => isTaskVisible(task));
    if (firstVisibleTask) {
        selectTask(firstVisibleTask.id);
        scrollToTask(firstVisibleTask.id);
    }
}

function cancelEdit(element) {
    const taskId = parseInt(element.getAttribute('data-task-id'));
    const task = findTaskById(taskId);
    if (task) {
        element.textContent = task.title;
        element.blur();
        setTimeout(() => {
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }, 0);
    }
}

function enterEditMode() {
    if (selectedTaskIds.size > 0) {
        const lastSelectedId = Array.from(selectedTaskIds).pop();
        const taskElement = document.querySelector(`[data-task-id="${lastSelectedId}"]`);
        if (taskElement) {
            const taskTitleElement = taskElement.querySelector('.task-title');
            if (taskTitleElement) {
                taskTitleElement.focus();
                // カーソルを末尾に移動
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(taskTitleElement);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }
}

function expandSelectedTask() {
    if (selectedTaskIds.size > 0) {
        const lastSelectedId = Array.from(selectedTaskIds).pop();
        const task = findTaskById(lastSelectedId);
        if (task && task.children && task.children.length > 0 && !task.isExpanded) {
            toggleChildren(lastSelectedId);
        }
    }
}

function collapseSelectedTask() {
    if (selectedTaskIds.size > 0) {
        const lastSelectedId = Array.from(selectedTaskIds).pop();
        const task = findTaskById(lastSelectedId);
        if (task && task.children && task.children.length > 0 && task.isExpanded) {
            toggleChildren(lastSelectedId);
        } else {
            // 子要素がない場合や既に閉じている場合は、親タスクを選択
            const parentTask = findParentTask(lastSelectedId);
            if (parentTask) {
                selectedTaskIds.clear();
                selectedTaskIds.add(parentTask.id);
                updateTaskSelection();
                scrollToTask(parentTask.id);
            }
        }
    }
}

function moveSelection(direction) {
    const allTasks = getAllTasksFlattened();
    const visibleTasks = allTasks.filter(task => isTaskVisible(task));

    if (visibleTasks.length === 0) return;

    if (selectedTaskIds.size === 0) {
        // 選択されているタスクがない場合、最初または最後のタスクを選択
        const taskToSelect = direction > 0 ? visibleTasks[0] : visibleTasks[visibleTasks.length - 1];
        selectTask(taskToSelect.id);
        return;
    }

    const lastSelectedId = Array.from(selectedTaskIds).pop();
    const currentIndex = visibleTasks.findIndex(task => task.id === lastSelectedId);
    
    if (currentIndex === -1) {
        // 現在選択されているタスクが見つからない場合、最初のタスクを選択
        selectTask(visibleTasks[0].id);
        return;
    }

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = visibleTasks.length - 1;
    if (newIndex >= visibleTasks.length) newIndex = 0;

    selectTask(visibleTasks[newIndex].id);
    scrollToTask(visibleTasks[newIndex].id);
}

function findUpperVisibleTaskId(visibleTasks) {
    const selectedIndices = Array.from(selectedTaskIds)
        .map(id => visibleTasks.findIndex(task => task.id === id))
        .filter(index => index !== -1)
        .sort((a, b) => a - b);

    if (selectedIndices.length === 0 || selectedIndices[0] === 0) {
        return null;
    }

    return visibleTasks[selectedIndices[0] - 1].id;
}

function isTaskVisible(task) {
    if (hideCompleted && task.status === 2) {
        return false;
    }
    let currentTask = task;
    while (currentTask) {
        const parentTask = findParentTask(currentTask.id);
        if (parentTask && !parentTask.isExpanded) {
            return false;
        }
        currentTask = parentTask;
    }
    return true;
}

function getAllTasksFlattened() {
    const flattened = [];
    function flatten(tasks, depth = 0, isVisible = true) {
        tasks.forEach(task => {
            if (!hideCompleted || task.status !== 2) {
                flattened.push({ ...task, depth, isVisible });
            }
            if (task.children && task.children.length > 0) {
                flatten(task.children, depth + 1, isVisible && task.isExpanded);
            }
        });
    }
    flatten(tasks);
    return flattened;
}

function scrollToTask(taskId) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskElement) {
        taskElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function selectTask(taskId) {
    if (!event.shiftKey) {
        selectedTaskIds.clear();
    }
    selectedTaskIds.add(taskId);
    lastSelectedTaskId = taskId;
    updateTaskSelection();
}

function expandParents(taskId) {
    let currentTask = tasks.find(task => task.id === taskId);
    while (currentTask) {
        const parentTask = findParentTask(currentTask.id);
        if (parentTask) {
            const childrenContainer = document.getElementById(`children-${parentTask.id}`);
            if (childrenContainer) {
                childrenContainer.style.display = 'block';
                const toggleBtn = childrenContainer.parentElement.querySelector('.toggle-btn');
                if (toggleBtn) toggleBtn.textContent = '▼';
            }
            currentTask = parentTask;
        } else {
            break;
        }
    }
    getAllTasksFlattened(); // 表示状態を更新
}

function findParentTask(taskId, taskList = tasks) {
    for (const task of taskList) {
        if (task.children && task.children.some(child => child.id === taskId)) {
            return task;
        }
        if (task.children) {
            const parent = findParentTask(taskId, task.children);
            if (parent) return parent;
        }
    }
    return null;
}

function updateTaskSelection() {
    document.querySelectorAll('.task-item').forEach(item => {
        const itemId = parseInt(item.getAttribute('data-task-id'));
        if (selectedTaskIds.has(itemId)) {
            item.classList.add('selected');
            // 選択されたタスクが表示されるようにスクロール
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function exportTasks(style) {
    switch (style) {
        case 'json':
            return JSON.stringify(tasks, null, 2);
        case 'spaces':
            return tasksToText(tasks, '  ');
        case 'asterisks':
            return tasksToText(tasks, '*');
        case 'dashes':
            return tasksToText(tasks, '-');
        case 'noIndent':
            return tasksToText(tasks, '');
        default:
            return JSON.stringify(tasks, null, 2);
    }
}

function tasksToText(tasks, indent = '  ', level = 0) {
    let result = '';
    tasks.forEach(task => {
        if (indent === '*' || indent === '-') {
            result += ' '.repeat(level * 2) + indent + ' ' + task.title + '\n';
        } else if (indent === '') {
            result += task.title + '\n';
        } else {
            result += indent.repeat(level) + task.title + '\n';
        }
        if (task.children && task.children.length > 0) {
            result += tasksToText(task.children, indent, level + 1);
        }
    });
    return result;
}

function importTasks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedTasks = JSON.parse(e.target.result);
                if (!Array.isArray(importedTasks)) {
                    throw new Error('Invalid format: Imported data is not an array');
                }
                importedTasksTemp = importedTasks;
                showImportModal();
            } catch (error) {
                console.error('Import error:', error);
                alert('Error importing tasks. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function showExportModal() {
    document.getElementById('exportModal').style.display = 'block';
    exportToTextBox();
}

function hideExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

function exportToTextBox() {
    const style = document.querySelector('input[name="exportStyle"]:checked').value;
    const tasksText = exportTasks(style);
    const textBox = document.getElementById('exportTextBox');
    textBox.value = tasksText;
}

function showImportModal() {
    document.getElementById('importModal').style.display = 'block';
    document.getElementById('importTextBox').value = '';
}

function exportToFile() {
    const style = document.querySelector('input[name="exportStyle"]:checked').value;
    const tasksText = exportTasks(style);
    const blob = new Blob([tasksText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // ファイル名にスタイルを反映
    let fileName;
    switch(style) {
        case 'json':
            fileName = 'tasks.json';
            break;
        case 'spaces':
            fileName = 'tasks_spaces.txt';
            break;
        case 'asterisks':
            fileName = 'tasks_asterisks.txt';
            break;
        case 'dashes':
            fileName = 'tasks_dashes.txt';
            break;
        case 'noIndent':
            fileName = 'tasks_no_indent.txt';
            break;
        default:
            fileName = 'tasks.txt';
    }
    
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    hideExportModal();
}

function importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                importedTasksTemp = JSON.parse(e.target.result);
                if (!Array.isArray(importedTasksTemp)) {
                    throw new Error('Invalid format: Imported data is not an array');
                }
                handleImport();
            } catch (error) {
                console.error('Import error:', error);
                alert('Error importing tasks. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function showImportTextBox() {
    const importTextBox = document.getElementById('importTextBox');
    importTextBox.style.display = 'block';
    importTextBox.value = '';
    document.getElementById('importOptions').style.display = 'block';
}

function handleImport() {
    const importStyle = document.querySelector('input[name="importStyle"]:checked').value;
    const importType = document.querySelector('input[name="importType"]:checked').value;
    const textBox = document.getElementById('importTextBox');
    const importedText = textBox.value.trim();

    let importedTasks;
    try {
        if (importStyle === 'json') {
            importedTasks = JSON.parse(importedText);
        } else {
            importedTasks = textToTasks(importedText, importStyle);
        }

        // インポートされたタスクのIDを更新
        updateTaskIds(importedTasks);

        if (importType === 'append') {
            tasks = tasks.concat(importedTasks);
        } else {
            tasks = importedTasks;
        }

        saveTasks();
        renderTasks();
        hideImportModal();
        alert('Tasks imported successfully!');
    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing tasks. Please check the format and try again.');
    }
}

function textToTasks(text, style) {
    const lines = text.split('\n');
    const rootTasks = [];
    const stack = [{ level: -1, tasks: rootTasks }];

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine === '') return;

        let level = 0;
        let title = trimmedLine;

        switch (style) {
            case 'spaces':
                level = line.search(/\S|$/);
                title = line.trim();
                break;
            case 'asterisks':
            case 'dashes':
                level = line.search(/[*-]/);
                title = line.replace(/^[*-]\s*/, '').trim();
                break;
            case 'noIndent':
                level = 0;
                break;
        }

        const task = { id: Date.now() + Math.random(), title, status: 0, children: [], isExpanded: true };

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        stack[stack.length - 1].tasks.push(task);
        stack.push({ level, tasks: task.children });
    });

    return rootTasks;
}

function updateTaskIds(taskList) {
    let maxId = getMaxTaskId(tasks);
    
    function updateIds(tasks) {
        tasks.forEach(task => {
            maxId++;
            task.id = maxId;
            if (!Array.isArray(task.children)) task.children = [];
            updateIds(task.children);
        });
    }
    
    updateIds(taskList);
}

function getMaxTaskId(taskList) {
    let maxId = 0;
    
    function findMaxId(tasks) {
        tasks.forEach(task => {
            maxId = Math.max(maxId, task.id);
            if (task.children && task.children.length > 0) {
                findMaxId(task.children);
            }
        });
    }
    
    findMaxId(taskList);
    return maxId;
}

function cancelImport() {
    hideImportModal();
}

function hideImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function dragStart(e) {
    draggedTask = e.target.closest('.task-item');
    if (!draggedTask) return;
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
    try {
        if (draggedTask && dropTarget && dropTarget !== draggedTask && dropPosition) {
            const draggedTaskId = parseInt(draggedTask.getAttribute('data-task-id'));
            const targetTaskId = parseInt(dropTarget.getAttribute('data-task-id'));
            moveTaskToNewPosition(draggedTaskId, targetTaskId, dropPosition);
        }
    } finally {
        finishDrag();
    }
}

function dragEnd() {
    finishDrag();
}

function finishDrag() {
    if (draggedTask && draggedTask.classList) {
        draggedTask.classList.remove('dragging');
    }
    resetDragStyles();
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
    const draggedTask = findTaskById(draggedTaskId);
    const targetTask = findTaskById(targetTaskId);
    if (!draggedTask || !targetTask || getTaskWithDescendants(draggedTask).some(task => task.id === targetTaskId)) {
        return;
    }

    const findAndRemoveTask = (taskList, parentList = null, depth = 0) => {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === draggedTaskId) {
                return { task: taskList.splice(i, 1)[0], parentList: parentList, sourceList: taskList, index: i, depth: depth };
            }
            if (Array.isArray(taskList[i].children) && taskList[i].children.length > 0) {
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
        const { task, parentList, sourceList, index } = result;
        let inserted = false;

        if (position.endsWith('-parent') && parentList) {
            const grandParentList = findParentListContainingList(tasks, parentList);
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
            selectTask(draggedTaskId);
        } else {
            sourceList.splice(index, 0, task);
        }
    }
}

function findParentListContainingList(taskList, childList) {
    for (let task of taskList) {
        if (task.children === childList) {
            return taskList;
        }
        if (task.children && task.children.length > 0) {
            const found = findParentListContainingList(task.children, childList);
            if (found) return found;
        }
    }
    return null;
}

function loadTasks() {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
        normalizeTaskTree(tasks);
    }
    renderTasks();
}

function normalizeTaskTree(taskList) {
    if (!Array.isArray(taskList)) return;
    taskList.forEach(task => {
        if (!Array.isArray(task.children)) task.children = [];
        normalizeTaskTree(task.children);
    });
}

function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

function addTask(parentId = null) {
    const newTaskInput = document.getElementById('newTask');
    const taskTitle = newTaskInput.value.trim();
    if (taskTitle === '' && parentId === null) return;

    const newTask = {
        id: Math.max(Date.now(), getMaxTaskId(tasks) + 1),
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
        if (!addChildTask(parentId, newTask)) return;
    }

    saveTasks();
    renderTasks();
    selectTask(newTask.id);
}

function addChildTask(parentId, newTask) {
    const findAndAddChild = (taskList) => {
        for (let task of taskList) {
            if (task.id === parentId) {
                if (!Array.isArray(task.children)) task.children = [];
                task.children.push(newTask);
                return true;
            }
            if (Array.isArray(task.children) && task.children.length > 0 && findAndAddChild(task.children)) {
                return true;
            }
        }
        return false;
    };

    return findAndAddChild(tasks);
}

function deleteTask(taskId) {
    const deleteTaskRecursive = (taskList) => {
        if (!taskList || !Array.isArray(taskList)) return false;
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === taskId) {
                taskList.splice(i, 1);
                return true;
            }
            if (taskList[i].children && taskList[i].children.length > 0) {
                if (deleteTaskRecursive(taskList[i].children)) {
                    return true;
                }
            }
        }
        return false;
    };

    if (deleteTaskRecursive(tasks)) {
        saveTasks();
        renderTasks();
        // 選択を解除
        selectedTaskIds.delete(taskId);
        updateTaskSelection();
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
            if (Array.isArray(task.children) && task.children.length > 0 && cycleStatusRecursive(task.children)) {
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
    // 選択状態を維持
    updateTaskSelection();
}

function renderTaskTree(taskList, parentElement, depth = 0) {
    taskList.forEach(task => {
        if (hideCompleted && task.status === 2) {
            return; // 完了したタスクを非表示にする
        }

        const li = document.createElement('li');
        li.className = 'task-item';
        li.draggable = true;
        li.setAttribute('data-task-id', task.id);
        li.setAttribute('data-depth', depth);

        let toggleButton = `<button class="toggle-btn" style="visibility: ${task.children && task.children.length > 0 ? 'visible' : 'hidden'}" onclick="toggleChildren(${task.id})">${task.isExpanded ? '▼' : '▶'}</button>`;

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
                      data-task-id="${task.id}">${task.title}</span>
                ${showTimes ? `
                    <span class="task-times">
                        <span title="Add">${formatDate(task.addedAt)}</span>
                        ${task.startedAt ? `<span title="InProgress">🏁${formatDate(task.startedAt)}</span>` : ''}
                        ${task.completedAt ? `<span title="Done">✅${formatDate(task.completedAt)}</span>` : ''}
                    </span>
                ` : ''}
                <button onclick="addTask(${task.id})">+</button>
                <button onclick="deleteTask(${task.id})">Delete</button>
            </div>
        `;
        parentElement.appendChild(li);

        const taskTitleElement = li.querySelector('.task-title');
        taskTitleElement.addEventListener('blur', (e) => {
            const taskId = parseInt(e.target.getAttribute('data-task-id'));
            const task = findTaskById(taskId);
            if (task) {
                const newTitle = e.target.textContent.trim();
                if (newTitle !== task.title) {
                    updateTaskTitle(taskId, newTitle);
                }
            }
        });

        taskTitleElement.addEventListener('click', (e) => {
            e.stopPropagation();
            selectTask(task.id);
            // タイトルをクリックした場合のみ編集モードに入る
            enterEditMode();
        });

        taskTitleElement.addEventListener('focus', () => {
            selectTask(task.id);
        });

        taskTitleElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.target.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit(e.target);
            }
        });

        // タスク項目全体のクリックイベントリスナー
        li.addEventListener('click', (e) => {
            // タイトル以外の部分をクリックした場合
            if (e.target.closest('.task-content')) {
                selectTask(task.id);
                e.stopPropagation();
            }
        });

        // ドラッグイベントリスナーを追加
        li.addEventListener('dragstart', dragStart);
        li.addEventListener('dragend', dragEnd);
        li.addEventListener('dragover', dragOver);
        li.addEventListener('drop', drop);
        li.addEventListener('dragleave', dragLeave);

        if (task.children && task.children.length > 0) {
            const childrenContainer = document.createElement('ul');
            childrenContainer.className = 'children-container';
            childrenContainer.id = `children-${task.id}`;
            childrenContainer.style.display = task.isExpanded ? 'block' : 'none';
            li.appendChild(childrenContainer);
            renderTaskTree(task.children, childrenContainer, depth + 1);
        }
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
    const task = findTaskById(taskId);
    if (!task) {
        console.error(`Task with id ${taskId} not found`);
        return;
    }

    task.title = newTitle.trim();
    saveTasks();
    renderTasks();
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
    const task = findTaskById(taskId);
    if (task && task.children && task.children.length > 0) {
        task.isExpanded = !task.isExpanded;
        saveTasks();
        renderTasks();
        // 選択状態を維持
        updateTaskSelection();
    }
}

function findTaskById(taskId, taskList = tasks) {
    for (const task of taskList) {
        if (task.id === taskId) {
            return task;
        }
        if (task.children) {
            const found = findTaskById(taskId, task.children);
            if (found) return found;
        }
    }
    return null;
}

function saveTaskState(taskId, isExpanded) {
    const taskStates = JSON.parse(localStorage.getItem('taskStates') || '{}');
    taskStates[taskId] = isExpanded;
    localStorage.setItem('taskStates', JSON.stringify(taskStates));
}

function getTaskState(taskId) {
    const taskStates = JSON.parse(localStorage.getItem('taskStates') || '{}');
    return taskStates[taskId] !== undefined ? taskStates[taskId] : true; // デフォルトは展開状態
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
            if (Array.isArray(task.children) && task.children.length > 0 && editTaskRecursive(task.children)) {
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
        return taskList.some(task => Array.isArray(task.children) && task.children.length > 0 && moveTaskInList(task.children));
    };

    if (moveTaskInList(tasks)) {
        saveTasks();
        renderTasks();
    }
}

function indentSelectedTasks() {
    const tasksToIndent = Array.from(selectedTaskIds).sort((a, b) => {
        const indexA = findTaskIndex(a);
        const indexB = findTaskIndex(b);
        return indexA - indexB;
    });

    tasksToIndent.forEach(taskId => {
        const task = findTaskById(taskId);
        if (task) {
            indentTask(taskId);
        }
    });

    updateTaskSelection();
}

function unindentSelectedTasks() {
    const tasksToUnindent = Array.from(selectedTaskIds).sort((a, b) => {
        const indexA = findTaskIndex(a);
        const indexB = findTaskIndex(b);
        return indexA - indexB;
    });

    tasksToUnindent.forEach(taskId => unindentTask(taskId));
    updateTaskSelection();
}

function findTaskIndex(taskId, taskList = tasks) {
    for (let i = 0; i < taskList.length; i++) {
        if (taskList[i].id === taskId) {
            return i;
        }
        if (taskList[i].children) {
            const index = findTaskIndex(taskId, taskList[i].children);
            if (index !== -1) {
                return index;
            }
        }
    }
    return -1;
}

function findParentList(taskId, taskList = tasks) {
    for (let i = 0; i < taskList.length; i++) {
        if (taskList[i].id === taskId) {
            return taskList;
        }
        if (taskList[i].children) {
            const result = findParentList(taskId, taskList[i].children);
            if (result) return result;
        }
    }
    return null;
}

function indentTask(taskId) {
    const task = findTaskById(taskId);
    if (!task) return;

    const parentList = findParentList(taskId);
    if (!parentList) return;

    const index = parentList.findIndex(t => t.id === taskId);
    if (index <= 0) return;

    const previousSibling = parentList[index - 1];
    if (!previousSibling.children) {
        previousSibling.children = [];
    }
    
    const [movedTask] = parentList.splice(index, 1);
    previousSibling.children.push(movedTask);

    saveTasks();
    renderTasks();
    updateTaskSelection();
}

function unindentTask(taskId) {
    const task = findTaskById(taskId);
    if (!task) return;

    const parent = findParentTask(taskId);
    if (!parent) return;

    const grandParentList = findParentList(parent.id);
    if (!grandParentList) return;

    const parentIndex = grandParentList.findIndex(t => t.id === parent.id);
    const taskIndex = parent.children.findIndex(t => t.id === taskId);

    const [movedTask] = parent.children.splice(taskIndex, 1);
    grandParentList.splice(parentIndex + 1, 0, movedTask);

    saveTasks();
    renderTasks();
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
    if (event.key === 'Enter' && event.target.id === 'newTask') {
        event.preventDefault(); // フォーム送信を防ぐ
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
            if (Array.isArray(task.children) && task.children.length > 0 && completeTaskRecursive(task.children)) {
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
        if (Array.isArray(child.children) && child.children.length > 0) {
            completeChildren(child.children);
        }
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadTasks();

    // ラジオボタンの変更イベントリスナーを追加
    document.querySelectorAll('input[name="exportStyle"]').forEach(radio => {
        radio.addEventListener('change', exportToTextBox);
    });

    // モーダルの外側をクリックしたときにモーダルを閉じる
    window.onclick = function(event) {
        if (event.target.className === 'modal') {
            event.target.style.display = 'none';
        }
    };
});
document.addEventListener('keydown', handleKeyDown);
