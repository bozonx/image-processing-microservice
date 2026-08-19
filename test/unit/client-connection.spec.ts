import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import {
  RequestAbortedError,
  isAbortError,
  watchClient,
} from '../../src/modules/image-processing/client-connection.js';

describe('client-connection (unit)', () => {
  describe('RequestAbortedError', () => {
    it('creates an instance with default message and name', () => {
      const error = new RequestAbortedError();
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RequestAbortedError);
      expect(error.name).toBe('RequestAbortedError');
      expect(error.message).toBe('Request aborted');
    });

    it('creates an instance with custom message', () => {
      const error = new RequestAbortedError('Custom abort');
      expect(error.message).toBe('Custom abort');
      expect(error.name).toBe('RequestAbortedError');
    });
  });

  describe('isAbortError', () => {
    it('recognises RequestAbortedError', () => {
      expect(isAbortError(new RequestAbortedError())).toBe(true);
    });

    it('recognises Error with name AbortError', () => {
      const err = new Error('Some abort');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('recognises Error with message "The operation was aborted"', () => {
      expect(isAbortError(new Error('The operation was aborted'))).toBe(true);
    });

    it('recognises Error with message "Request aborted"', () => {
      expect(isAbortError(new Error('Request aborted'))).toBe(true);
    });

    it('returns false for generic errors', () => {
      expect(isAbortError(new Error('Something failed'))).toBe(false);
      expect(isAbortError(new Error('Connection reset'))).toBe(false);
    });

    it('returns false for non-error primitives and objects', () => {
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError('AbortError')).toBe(false);
      expect(isAbortError(123)).toBe(false);
      expect(isAbortError({})).toBe(false);
      expect(isAbortError({ name: 'AbortError' })).toBe(false);
    });
  });

  describe('watchClient', () => {
    const createMockReqRes = (options?: { complete?: boolean; destroyed?: boolean }) => {
      const reqRaw = Object.assign(new EventEmitter(), {
        complete: options?.complete ?? true,
      });
      const resRaw = Object.assign(new EventEmitter(), {
        destroyed: options?.destroyed ?? false,
      });

      const req = { raw: reqRaw } as any;
      const res = { raw: resRaw } as any;

      return { req, res, reqRaw, resRaw };
    };

    it('returns initial connected state and abort signal', () => {
      const { req, res } = createMockReqRes();
      const connection = watchClient(req, res);

      expect(connection.disconnected()).toBe(false);
      expect(connection.signal.aborted).toBe(false);
      connection.dispose();
    });

    it('aborts when request closes prematurely (!complete)', () => {
      const { req, res, reqRaw } = createMockReqRes({ complete: false });
      const onAbort = jest.fn();
      const connection = watchClient(req, res, onAbort);

      reqRaw.emit('close');

      expect(connection.disconnected()).toBe(true);
      expect(connection.signal.aborted).toBe(true);
      expect(connection.signal.reason).toBeInstanceOf(RequestAbortedError);
      expect(onAbort).toHaveBeenCalledTimes(1);
      connection.dispose();
    });

    it('does not abort when request closes after full completion (complete: true and !destroyed)', () => {
      const { req, res, reqRaw } = createMockReqRes({ complete: true, destroyed: false });
      const onAbort = jest.fn();
      const connection = watchClient(req, res, onAbort);

      reqRaw.emit('close');

      expect(connection.disconnected()).toBe(false);
      expect(connection.signal.aborted).toBe(false);
      expect(onAbort).not.toHaveBeenCalled();
      connection.dispose();
    });

    it('aborts when response closes while destroyed', () => {
      const { req, res, resRaw } = createMockReqRes({ complete: true, destroyed: true });
      const onAbort = jest.fn();
      const connection = watchClient(req, res, onAbort);

      resRaw.emit('close');

      expect(connection.disconnected()).toBe(true);
      expect(connection.signal.aborted).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
      connection.dispose();
    });

    it('aborts when response emits an error', () => {
      const { req, res, resRaw } = createMockReqRes();
      const onAbort = jest.fn();
      const connection = watchClient(req, res, onAbort);

      resRaw.emit('error', new Error('Socket error'));

      expect(connection.disconnected()).toBe(true);
      expect(connection.signal.aborted).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
      connection.dispose();
    });

    it('is idempotent when multiple abort conditions trigger', () => {
      const { req, res, reqRaw, resRaw } = createMockReqRes({ complete: false, destroyed: true });
      const onAbort = jest.fn();
      const connection = watchClient(req, res, onAbort);

      reqRaw.emit('close');
      resRaw.emit('close');
      resRaw.emit('error', new Error('Socket error'));

      expect(connection.disconnected()).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
      connection.dispose();
    });

    it('removes listeners upon calling dispose()', () => {
      const { req, res, reqRaw, resRaw } = createMockReqRes();
      const connection = watchClient(req, res);

      expect(reqRaw.listenerCount('close')).toBe(1);
      expect(resRaw.listenerCount('close')).toBe(1);
      expect(resRaw.listenerCount('error')).toBe(1);

      connection.dispose();

      expect(reqRaw.listenerCount('close')).toBe(0);
      expect(resRaw.listenerCount('close')).toBe(0);
      expect(resRaw.listenerCount('error')).toBe(0);
    });
  });
});
