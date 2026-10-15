const ask = (rl, prompt) =>
  new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));

const askHidden = (prompt) =>
  new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('This operation requires an interactive terminal for hidden password input.'));
      return;
    }

    process.stdout.write(prompt);
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Operation cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (value.length < 256) {
          value += character;
        }
      }
    };

    process.stdin.on('data', onData);
  });

module.exports = { ask, askHidden };
