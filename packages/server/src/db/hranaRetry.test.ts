import { describe, expect, it, vi } from 'vitest';
import {
  HRANA_MAX_RETRIES,
  isHranaStreamError,
  withHranaRetry,
  wrapWithHranaRetry,
} from './hranaRetry.js';

const STREAM_ERR = new Error(
  'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: c03d735a:150ad791\\"}"))',
);

describe('isHranaStreamError', () => {
  it('detecta el patrón "stream not found" en el mensaje', () => {
    expect(isHranaStreamError(STREAM_ERR)).toBe(true);
  });

  it('no clasifica otros errores como Hrana', () => {
    expect(isHranaStreamError(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isHranaStreamError(new Error('Hrana(Api("status=401"))'))).toBe(false);
    expect(isHranaStreamError(null)).toBe(false);
    expect(isHranaStreamError(undefined)).toBe(false);
  });
});

describe('withHranaRetry', () => {
  it('devuelve el valor en el primer intento cuando todo va bien', () => {
    const fn = vi.fn(() => 42);
    expect(withHranaRetry(fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta ante stream not found y tiene éxito en el reintento', () => {
    let calls = 0;
    const result = withHranaRetry(() => {
      calls += 1;
      if (calls === 1) throw STREAM_ERR;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('agenda hasta HRANA_MAX_RETRIES reintentos y luego lanza', () => {
    const fn = vi.fn(() => {
      throw STREAM_ERR;
    });
    expect(() => withHranaRetry(fn)).toThrow(/stream not found/);
    expect(fn).toHaveBeenCalledTimes(HRANA_MAX_RETRIES + 1);
  });

  it('NO reintenta errores que no son de stream', () => {
    const fn = vi.fn(() => {
      throw new Error('UNIQUE constraint failed');
    });
    expect(() => withHranaRetry(fn)).toThrow(/UNIQUE/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respeta retries: 0 como passthrough (sin reintentos)', () => {
    const fn = vi.fn(() => {
      throw STREAM_ERR;
    });
    expect(() => withHranaRetry(fn, { retries: 0 })).toThrow(/stream not found/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('enabled: false actúa como passthrough puro', () => {
    const fn = vi.fn(() => {
      throw STREAM_ERR;
    });
    expect(() => withHranaRetry(fn, { enabled: false })).toThrow(/stream not found/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('llama al hook onRetry con el número de intento', () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = withHranaRetry(() => {
      calls += 1;
      if (calls <= 2) throw STREAM_ERR;
      return 'done';
    }, { onRetry });
    expect(result).toBe('done');
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, STREAM_ERR);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, STREAM_ERR);
  });

  it('propaga el valor con this-binding intacto', () => {
    const obj = {
      n: 7,
      read() {
        if (obj.flag) {
          obj.flag = false; // solo la primera llamada falla
          throw STREAM_ERR;
        }
        return this.n;
      },
      flag: true,
    };
    expect(withHranaRetry(() => obj.read())).toBe(7);
  });
});

describe('wrapWithHranaRetry', () => {
  function makeFakeDb() {
    const calls: string[] = [];
    const db = {
      calls,
      prepare: (sql: string) => ({
        sql,
        run: () => {
          calls.push(`run:${sql}`);
          if (calls.filter((c) => c.startsWith('run:')).length === 1) throw STREAM_ERR;
          return { changes: 1 };
        },
        get: () => {
          calls.push(`get:${sql}`);
          return { id: 1 };
        },
        all: () => {
          calls.push(`all:${sql}`);
          return [];
        },
      }),
      transaction: (fn: (n: number) => number) => (n: number) => {
        calls.push(`tx:${n}`);
        if (calls.filter((c) => c.startsWith('tx:')).length === 1) throw STREAM_ERR;
        return fn(n);
      },
      exec: (sql: string) => {
        calls.push(`exec:${sql}`);
      },
      pragma: (p: string) => {
        calls.push(`pragma:${p}`);
      },
      iterate: () => {
        calls.push('iterate');
        return [1, 2][Symbol.iterator]();
      },
    };
    return db;
  }

  it('retrya stmt.run en un statement obtenido vía db.prepare', () => {
    const db = wrapWithHranaRetry(makeFakeDb());
    expect(db.prepare('INSERT x').run()).toEqual({ changes: 1 });
    // 1er intento falla (stream), 2º tiene éxito
    expect(db.calls.filter((c) => c === 'run:INSERT x')).toHaveLength(2);
  });

  it('retrya la transacción completa si el stream muere a mitad', () => {
    const db = wrapWithHranaRetry(makeFakeDb());
    const tx = db.transaction((n: number) => n * 2);
    expect(tx(21)).toBe(42);
    expect(db.calls.filter((c) => c === 'tx:21')).toHaveLength(2);
  });

  it('retrya pragma y exec', () => {
    const db = wrapWithHranaRetry(makeFakeDb());
    db.pragma('foreign_keys = ON');
    db.exec('SELECT 1');
    expect(db.calls).toContain('pragma:foreign_keys = ON');
    expect(db.calls).toContain('exec:SELECT 1');
  });

  it('deja iterate() y métodos de configuración sin tocar', () => {
    const db = wrapWithHranaRetry(makeFakeDb());
    expect([...db.iterate()]).toEqual([1, 2]);
    expect(db.calls).toContain('iterate');
  });

  it('disabled: true es un passthrough puro (mismo handle)', () => {
    const raw = makeFakeDb();
    const db = wrapWithHranaRetry(raw, false);
    expect(db).toBe(raw);
  });

  it('los errores que no son de stream se propagan al primer intento', () => {
    const db = wrapWithHranaRetry({
      prepare: () => ({
        all: () => {
          throw new Error('no such table: x');
        },
      }),
    });
    expect(() => db.prepare('x').all()).toThrow(/no such table/);
  });
});
