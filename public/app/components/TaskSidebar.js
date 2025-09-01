export function TaskSidebar({ onSelect, onRename, onDelete }) {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar';

  const header = document.createElement('div');
  header.className = 'sidebar-header';
  header.textContent = 'Tasks';

  const list = document.createElement('div');
  list.className = 'sidebar-list';

  let tasks = [];
  let currentId = null;

  function render() {
    list.innerHTML = '';
    tasks
      .slice()
      .sort((a,b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt))
      .forEach((t) => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        if (t.id === currentId) item.classList.add('active');

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = t.description || '(untitled)';

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${t.status || 'created'} • ${new Date(t.updatedAt||t.createdAt).toLocaleTimeString()}`;

        const actions = document.createElement('div');
        actions.className = 'actions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn small';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = prompt('Rename task', t.description || '');
          if (name != null) onRename && onRename(t, name);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger small';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this task?')) onDelete && onDelete(t);
        });

        actions.append(renameBtn, delBtn);

        item.append(title, meta, actions);
        item.addEventListener('click', () => onSelect && onSelect(t));
        list.append(item);
      });
  }

  function update(newTasks, currentTaskId) {
    tasks = newTasks || [];
    currentId = currentTaskId || null;
    render();
  }

  wrap.append(header, list);
  return Object.assign(wrap, { update });
}
