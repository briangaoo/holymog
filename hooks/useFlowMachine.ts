'use client';

import { useReducer } from 'react';
import type { FlowAction, FlowState } from '@/types';

const initial: FlowState = { type: 'idle' };

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'CAMERA_READY':
      if (state.type === 'idle' || state.type === 'error') {
        return { type: 'streaming' };
      }
      return state;
    case 'FACE_STABLE':
      if (state.type === 'streaming') {
        return { type: 'detected', stableSince: Date.now() };
      }
      return state;
    case 'FACE_LOST':
      if (state.type === 'detected') return { type: 'streaming' };
      return state;
    case 'CAPTURE':
      if (state.type === 'detected' || state.type === 'streaming') {
        // First transition to capturing then immediately to mapping
        return {
          type: 'mapping',
          capturedImage: action.image,
          landmarks: action.landmarks,
        };
      }
      return state;
    case 'MAPPING_DONE':
      if (state.type === 'mapping') {
        return { type: 'revealing', scores: action.scores };
      }
      return state;
    case 'REVEAL_DONE':
      if (state.type === 'revealing') {
        return { type: 'complete', scores: state.scores };
      }
      return state;
    case 'RETAKE':
      return { type: 'streaming' };
    case 'ERROR':
      return { type: 'error', message: action.message };
    default:
      return state;
  }
}

export function useFlowMachine() {
  return useReducer(reducer, initial);
}
