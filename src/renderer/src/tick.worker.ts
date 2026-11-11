// A worker timer keeps ticking at full rate when the window is in the
// background, where page timers are slowed down.
let timer: ReturnType<typeof setInterval> | null = null
self.onmessage = (e: MessageEvent<number>) => {
  if (timer) clearInterval(timer)
  timer = e.data > 0 ? setInterval(() => self.postMessage(0), e.data) : null
}
