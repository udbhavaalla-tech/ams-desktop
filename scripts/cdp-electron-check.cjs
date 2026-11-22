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
    const status = await window.ams.getStatus();
    const name = "__AMS_LIFECYCLE_CHECK_" + Date.now();
    const created = await window.ams.db.create("programmes", { name, code: "CHECK", status: "active" });
    const edited = await window.ams.db.update("programmes", created.id, { name: name + " EDITED" });
    const read = await window.ams.db.get("programmes", created.id);
    await window.ams.db.delete("programmes", created.id);
    const gone = await window.ams.db.get("programmes", created.id);
    const entities = ["programmes","semesters","subjects","units","topics","calendar_events","timetable_sessions","tasks","reminders","habits","habit_entries","study_sessions","availability"];
    const records = {};
    for (const entity of entities) records[entity] = (await window.ams.db.list(entity)).length;
    const routes = ["/","/academics","/calendar","/timetable","/tasks","/reminders","/habits","/study","/analytics","/settings"];
    const routeChecks = [];
    for (const route of routes) {
      location.hash = route;
      await new Promise(resolve => setTimeout(resolve, 120));
      routeChecks.push({
        route,
        ready: document.readyState,
        title: document.title,
        hasUndefinedDbError: document.body.innerText.includes("Cannot read properties of undefined")
      });
    }
    return {
      status,
      createdId: created.id,
      editedName: edited.name,
      readName: read.name,
      gone: gone || null,
      records,
      routeChecks
    };
  })()`;
  const evaluated = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  const value = evaluated?.result?.value ?? evaluated?.result ?? evaluated;
  console.log(JSON.stringify(value, null, 2));
  socket.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
