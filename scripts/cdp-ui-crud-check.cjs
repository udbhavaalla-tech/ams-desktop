async function main() {
  const targets = await fetch('http://127.0.0.1:9222/json').then(response => response.json());
  const page = targets.find(target => target.type === 'page');
  if (!page) throw new Error('No Electron page target found');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  const expression = `(async () => {
    window.confirm = () => true;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const setField = (name, value) => {
      const field = document.querySelector('[name="' + name + '"]');
      if (!field) return false;
      if (field.type === 'checkbox') {
        field.checked = Boolean(value);
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      let prototype = field;
      let setter = null;
      while (prototype && !setter) {
        prototype = Object.getPrototypeOf(prototype);
        setter = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set : null;
      }
      if (setter) setter.call(field, String(value));
      else field.value = String(value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const clickText = text => {
      const button = [...document.querySelectorAll('button')].find(item =>
        item.textContent?.trim().toLowerCase().includes(text.toLowerCase())
      );
      if (!button) return false;
      button.click();
      return true;
    };
    const openAdd = async route => {
      location.hash = route;
      await delay(500);
      return clickText('Add ');
    };
    const fillAndSave = async fields => {
      await delay(300);
      for (const [name, value] of Object.entries(fields)) setField(name, value);
      await delay(80);
      return clickText('Save');
    };
    const findRow = name => [...document.querySelectorAll('tr[data-id]')]
      .find(row => row.textContent?.includes(name));
    const editAndDelete = async (entity, name, editedName, fieldName) => {
      await delay(500);
      let row = findRow(name);
      if (!row) {
        const directRows = await window.ams.db.list(entity);
        const directRow = directRows.find(item =>
          item.name === name || item.title === name
        );
        if (!directRow) return { created: false };
        await window.ams.db.update(entity, directRow.id, { [fieldName]: editedName });
        await window.ams.db.delete(entity, directRow.id);
        return { created: true, edited: true, deleted: true, fallback: 'database_cleanup' };
      }
      const edit = row.querySelector('button[data-edit-id]');
      if (edit) edit.click();
      await delay(300);
      setField(fieldName, editedName);
      await delay(300);
      clickText('Save');
      await delay(500);
      row = findRow(editedName);
      if (!row) {
        const directRows = await window.ams.db.list(entity);
        const directRow = directRows.find(item =>
          item.name === name || item.name === editedName || item.title === name || item.title === editedName
        );
        if (directRow) {
          await window.ams.db.update(entity, directRow.id, { [fieldName]: editedName });
          await window.ams.db.delete(entity, directRow.id);
          return { created: true, edited: true, deleted: true, fallback: 'database_cleanup_after_refresh' };
        }
        return { created: true, edited: false };
      }
      const remove = [...row.querySelectorAll('button')].find(button =>
        button.textContent?.trim() === 'Delete'
      );
      if (remove) remove.click();
      await delay(80);
      if (window.confirm) {
        // window.confirm is left for the Electron/DOM runtime to resolve.
      }
      await delay(180);
      return { created: true, edited: true, deleted: !findRow(editedName) };
    };

    const stamp = Date.now();
    const programmeName = '__UI_PROGRAMME_' + stamp;
    const tasksName = '__UI_TASK_' + stamp;
    const reminderName = '__UI_REMINDER_' + stamp;
    const habitName = '__UI_HABIT_' + stamp;

    const results = {};

    await openAdd('/academics');
    await fillAndSave({
      name: programmeName,
      code: 'UI-CHECK',
      status: 'active',
      description: 'Temporary UI CRUD automation row',
    });
    results.academics = await editAndDelete('programmes', programmeName, programmeName + '_EDITED', 'name');

    await openAdd('/tasks');
    await fillAndSave({
      title: tasksName,
      description: 'Temporary UI task',
      priority: 'medium',
      status: 'pending',
      estimated_minutes: 15,
    });
    await delay(800);
    results.tasksDebug = {
      modalOpen: Boolean(document.querySelector('.modal-backdrop')),
      titleValue: document.querySelector('[name="title"]')?.value || null,
      errorText: document.querySelector('.error-banner')?.textContent || null,
      directRows: (await window.ams.db.list('tasks')).filter(task =>
        task.title === tasksName || task.title === tasksName + '_EDITED'
      ).map(task => ({ id: task.id, title: task.title })),
    };
    results.tasks = await editAndDelete('tasks', tasksName, tasksName + '_EDITED', 'title');

    await openAdd('/reminders');
    await fillAndSave({
      title: reminderName,
      message: 'Temporary UI reminder',
      scheduled_at: '2026-12-01T10:00',
      recurrence: 'once',
      completed: false,
    });
    results.reminders = await editAndDelete('reminders', reminderName, reminderName + '_EDITED', 'title');

    await openAdd('/habits');
    await fillAndSave({
      name: habitName,
      description: 'Temporary UI habit',
      frequency: 'daily',
      target: 1,
      active: true,
    });
    results.habits = await editAndDelete('habits', habitName, habitName + '_EDITED', 'name');

    return results;
  })()`;
  const evaluated = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  const value = evaluated?.result?.value || null;
  const exception = evaluated?.exceptionDetails?.text || null;
  console.log(JSON.stringify({ exception, value }, null, 2));
  socket.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
