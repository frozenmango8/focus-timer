# Focus Timer

[![CI](https://github.com/frozenmango8/focus-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/frozenmango8/focus-timer/actions/workflows/ci.yml)

A pomodoro timer that runs in the browser. Settings, tasks, and history stay on this device.

https://frozenmango8.github.io/focus-timer/

## Use

Set the focus, short break, and long break lengths, and how many focus sessions run before a long break. Start the timer. Space starts and pauses, S skips the phase, and R resets it.

Add a task and select it. Each finished focus session is counted on that task. History shows today's total and the last seven days.

A short chime plays when a phase ends. Turn on notifications if you also want a system notification. After the first visit the app works offline, and the browser can install it.

## Develop

```sh
npm install
npm run dev
```

The dev server is at http://localhost:5173/focus-timer/.

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

## License

MIT
