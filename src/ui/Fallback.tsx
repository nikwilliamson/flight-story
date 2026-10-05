import { Component, type ReactNode } from 'react'
import { useStory } from '../state/store'

const COPY = {
  error: "The globe couldn't start on this device.",
  lost: 'The globe stopped drawing.',
}

/** Shown in place of the scene when it can't draw: a plain line and a way to try again. */
export function Fallback() {
  const failed = useStory((s) => s.failed)
  if (!failed) return null
  return (
    <div className="fallback" role="alert">
      <p>{COPY[failed]}</p>
      <button className="pill" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  )
}

/** Catches a throw anywhere in the scene (a texture too big for the GPU, a shader that won't compile) so the page survives. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
    useStory.getState().setFailed('error')
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
