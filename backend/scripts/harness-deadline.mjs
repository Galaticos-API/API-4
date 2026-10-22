// AbortSignal.timeout usa um timer sem referência; sozinho ele não mantém o processo de teste ativo.
export async function withHarnessDeadline(operation, timeoutMs = 5000) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => operation(controller.signal)),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error('Tempo limite na comunicação com o serviço de teste.');
                    controller.abort(error);
                    reject(error);
                }, timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
