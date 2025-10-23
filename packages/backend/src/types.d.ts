/// <reference path="../../shared/src/types.ts" />

declare namespace Express {
    export interface Request {
        user?: Awaited<ReturnType<typeof import('./utils/authLoader').AuthUser>>;
    }
}