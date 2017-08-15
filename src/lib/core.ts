import { ServerRequest, ServerResponse } from 'http';
import { Context } from './context';
import {
  Middleware, MiddlewareHandle, ErrorReason, NextFunction, PathRegExp, ContextConstructor, RegExpOptions,
} from './define';
import {
  testRoutePath, parseRoutePath, getRouteParams, isMiddlewareErrorHandle, execMiddlewareHandle, getRouteMatchPath,
} from './utils';

export class Core {

  protected readonly stack: Middleware[] = [];
  protected contextConstructor: ContextConstructor = Context;
  protected readonly routeOptions: RegExpOptions = {
    sensitive: true,
    strict: true,
    end: true,
    delimiter: '/',
  };
  protected parentRoutePath: RegExp = null;

  protected createContext(req: ServerRequest, res: ServerResponse) {
    return new this.contextConstructor().init(req, res);
  }

  protected parseRoutePath(isPrefix: boolean, route: string | RegExp) {
    return parseRoutePath(route, {
      ...this.routeOptions,
      end: !isPrefix,
    });
  }

  public toMiddleware() {
    const router = this;
    return function (ctx: Context) {
      router.handleRequestByContext(ctx, function (err) {
        ctx.next(err);
      });
    };
  }

  public use(route: string | RegExp, ...handles: Array<MiddlewareHandle | Core>) {
    this.useMiddleware(true, route, ...handles.map(item => {
      if (item instanceof Core) {
        item.parentRoutePath = this.parseRoutePath(true, route);
        return item.toMiddleware();
      }
      return item;
    }));
  }

  protected useMiddleware(isPrefix: boolean, route: string | RegExp, ...handles: MiddlewareHandle[]) {
    for (const handle of handles) {
      this.stack.push({
        route: this.parseRoutePath(isPrefix, route),
        handle,
        handleError: isMiddlewareErrorHandle(handle),
      });
    }
  }

  protected handleRequestByContext(ctx: Context, done: (err?: ErrorReason) => void) {
    let index = 0;
    const prePathPrefix = ctx.request.pathPrefix;
    const pathPrefix = getRouteMatchPath(ctx.request.path, this.parentRoutePath as PathRegExp);
    ctx.request.reset(pathPrefix, {});

    type GetMiddlewareHandle = () => (void | Middleware);

    const getNextHandle: GetMiddlewareHandle = () => {
      const handle = this.stack[index++];
      if (!handle) return;
      if (handle.handleError) return getNextHandle();
      return handle;
    };

    const getNextErrorHandle: GetMiddlewareHandle = () => {
      const handle = this.stack[index++];
      if (!handle) return;
      if (!handle.handleError) return getNextErrorHandle();
      return handle;
    };

    const next: NextFunction = (err) => {
      const handle = err ? getNextErrorHandle() : getNextHandle();
      err = err || null;
      if (!handle) {
        ctx.popNextHandle();
        ctx.request.reset(prePathPrefix, {});
        return done(err || null);
      }
      if (!testRoutePath(ctx.request.path, handle.route)) {
        return next(err);
      }
      ctx.request.params = getRouteParams(ctx.request.path, handle.route as PathRegExp);
      execMiddlewareHandle(handle.handle, ctx, err, next);
    };

    ctx.pushNextHandle(next);
    ctx.next();
  }

  protected handleRequestByRequestResponse(req: ServerRequest, res: ServerResponse, done: (err?: ErrorReason) => void) {
    this.handleRequestByContext(this.createContext(req, res), done);
  }

}