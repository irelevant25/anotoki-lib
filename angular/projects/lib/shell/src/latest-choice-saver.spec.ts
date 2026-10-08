import { latestChoiceSaver } from './latest-choice-saver';

/** Saves held until the test answers them, in the order it likes. */
function heldSaves(): { calls: string[]; answer(index: number, ok: boolean): Promise<void>; save(value: string): Promise<unknown> } {
  const pending: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  const calls: string[] = [];
  return {
    calls,
    save(value: string): Promise<unknown> {
      calls.push(value);
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    },
    async answer(index: number, ok: boolean): Promise<void> {
      if (ok) {
        pending[index].resolve();
      } else {
        pending[index].reject(new Error('refused'));
      }
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
      }
    },
  };
}

describe('latestChoiceSaver: one save at a time, the latest choice last', () => {
  it('saves a choice at once when nothing is on its way', async () => {
    const saves = heldSaves();
    const save = latestChoiceSaver((value: string) => saves.save(value));
    save('dark');
    expect(saves.calls).toEqual(['dark']);
    expect(save.saving()).toBe(true);
    await saves.answer(0, true);
    expect(save.saving()).toBe(false);
  });

  it('two quick choices: the second waits for the first, so the earlier can never be answered last', async () => {
    const saves = heldSaves();
    const save = latestChoiceSaver((value: string) => saves.save(value));
    save('en');
    save('sk');
    expect(saves.calls).toEqual(['en']);
    await saves.answer(0, true);
    expect(saves.calls).toEqual(['en', 'sk']);
    await saves.answer(1, true);
    expect(save.saving()).toBe(false);
  });

  it('three quick choices: only the latest waiting one is saved', async () => {
    const saves = heldSaves();
    const save = latestChoiceSaver((value: string) => saves.save(value));
    save('en');
    save('sk');
    save('de');
    await saves.answer(0, true);
    expect(saves.calls).toEqual(['en', 'de']);
  });

  it('a refusal of the latest choice is told; one a later choice has overtaken is no news', async () => {
    const saves = heldSaves();
    const refused = vi.fn();
    const save = latestChoiceSaver((value: string) => saves.save(value), refused);
    save('light');
    save('dark');
    await saves.answer(0, false);
    expect(refused).not.toHaveBeenCalled();
    await saves.answer(1, false);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(refused.mock.calls[0][1]).toBe('dark');
  });

  it('a save that throws at once counts as refused', async () => {
    const refused = vi.fn();
    const save = latestChoiceSaver(() => {
      throw new Error('no');
    }, refused);
    save('x');
    await Promise.resolve();
    await Promise.resolve();
    expect(refused).toHaveBeenCalledTimes(1);
    expect(save.saving()).toBe(false);
  });
});
