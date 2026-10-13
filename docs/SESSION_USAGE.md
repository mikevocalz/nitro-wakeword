# Owning a session

These examples describe the draft API; they are not device-test evidence. The
host owns the duration of listening and every action taken after a detection.

## A screen-owned session

Keep the session in a controller whose lifetime is the screen or application
feature. Request microphone permission in response to the host's visible UI.

```ts
import {createWakeWord, type WakeWordSession} from 'nitro-wakeword';

let session: WakeWordSession | undefined;

async function enableListening() {
  if (session) {
    await session.start();
    return;
  }
  const created = await createWakeWord({
    models: [{model: 'my_keyword.onnx', keyword: 'assistant'}],
    vadThreshold: 0,
  });
  try {
    if (!(await created.requestMicrophonePermission())) {
      throw new Error('Microphone permission was denied');
    }
    created.setDetectionListener(detection => {
      // Hand the event to the host's own interaction flow.
      console.log(detection.keyword);
    });
    await created.start();
    session = created;
  } catch (error) {
    await created.unload();
    throw error;
  }
}

async function disableListening() {
  const previous = session;
  session = undefined;
  await previous?.unload();
}
```

Serialize enable/disable requests in the host. If creation completes after the
screen has closed, unload that newly created session instead of retaining it.
Do not fire these functions concurrently or lose a pending session handle.

## Pause and resume

```ts
await session.stop();
// Models and listener remain owned by this session.
await session.setThreshold('assistant', 0.7);
await session.start();
```

After `unload()`, create another session rather than trying to reload the old
public handle. A runtime error may stop capture. Surface it in the host and
offer an explicit retry instead of spinning indefinitely.

## Hand capture to another session

```ts
await first.stop();
try {
  await second.start();
} catch (error) {
  // Present the error or choose a deliberate fallback in the host.
  throw error;
}
```

Multiple sessions can hold model state, but microphone ownership is exclusive.
Stopping is asynchronous; omitting `await` can make the second start reject.
Independent model state also costs memory, so prefer one session with multiple
classifiers when the application needs several wake phrases at once.

Listener removal and stop prevent future native emissions; a callback already
queued for JavaScript may still finish. If a callback would act on a screen that
has been replaced, guard it with the host's current operation/screen identity.
