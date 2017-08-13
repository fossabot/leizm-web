import { expect } from 'chai';
import { Server } from 'http';
import { Connect } from '../lib';
import * as request from 'supertest';

function sleep(ms: number): Promise<number> {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(ms), ms);
  });
}

describe('Connect', function () {

  it('封装了 http.Server', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      ctx.response.end('ok');
    });
    expect(app.server).to.instanceof(Server);
    request(app.server)
      .get('/')
      .expect(200)
      .expect('ok', done);
  });

  it('调用 listen 监听端口成功', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      ctx.response.end('ok');
    });
    app.listen({ port: 0 });
    request(app.server)
      .get('/')
      .expect(200)
      .expect('ok', done);
  });

  it('支持在 http.createServer 内使用', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      ctx.response.end('ok');
    });
    const server = new Server(function (req, res) {
      app.handleRequest(req, res);
    });
    request(server)
      .get('/')
      .expect(200)
      .expect('ok', done);
  });

  it('支持 async function', function (done) {
    const app = new Connect();
    app.use('/', async function (ctx) {
      await sleep(300);
      ctx.response.end('ok');
    });
    const t = process.uptime();
    request(app.server)
      .get('/')
      .expect(200)
      .expect('ok', function () {
        expect(process.uptime() - t).to.greaterThan(0.3);
        done();
      });
  });

  it('如果没有中间件响应结果，调用 done 回调函数', function (done) {
    const app = new Connect();
    const server = new Server(function (req, res) {
      app.handleRequest(req, res, function (err) {
        expect(err).to.equal(null);
        res.end('hello');
      });
    });
    request(server)
      .get('/')
      .expect(200)
      .expect('hello', done);
  });

  it('如果没有中间件响应 Error 结果，调用 done 回调函数时传递 Error 信息', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      ctx.next('test error');
    });
    const server = new Server(function (req, res) {
      app.handleRequest(req, res, function (err) {
        expect(err).to.equal('test error');
        res.end('hello');
      });
    });
    request(server)
      .get('/')
      .expect(200)
      .expect('hello', done);
  });

  it('如果没有中间件响应结果，且不传递 done 回调函数时，返回 404', function (done) {
    const app = new Connect();
    const server = new Server(function (req, res) {
      app.handleRequest(req, res);
    });
    request(server)
      .get('/')
      .expect(404, done);
  });

  it('如果没有中间件响应 Error 结果，且不传递 done 回调函数时，返回 500', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      ctx.next('test error');
    });
    const server = new Server(function (req, res) {
      app.handleRequest(req, res);
    });
    request(server)
      .get('/')
      .expect(500)
      .expect(/test error/, done);
  });

  it('支持捕捉中间件抛出的异常，并传递给出错处理中间件', function (done) {
    const app = new Connect();
    app.use('/', function (ctx) {
      throw new Error('oh error');
    });
    app.use('/', function (ctx, err) {
      expect(err).to.instanceof(Error);
      expect(err).property('message').to.equal('oh error');
      ctx.response.end('no error');
    });
    request(app.server)
      .get('/')
      .expect(200)
      .expect('no error', done);
  });

  it('支持捕捉 async function 中间件抛出的异常，并传递给出错处理中间件', function (done) {
    const app = new Connect();
    app.use('/', async function (ctx) {
      throw new Error('oh error');
    });
    app.use('/', function (ctx, err) {
      expect(err).to.instanceof(Error);
      expect(err).property('message').to.equal('oh error');
      ctx.response.end('no error');
    });
    request(app.server)
      .get('/')
      .expect(200)
      .expect('no error', done);
  });

  it('支持 URL 字符串前缀', function (done) {
    const app = new Connect();
    app.use('/a', function (ctx) {
      ctx.response.end('this is a');
    });
    app.use('/b', function (ctx) {
      ctx.response.end('this is b');
    });
    request(app.server)
      .get('/b')
      .expect(200)
      .expect('this is b', done);
  });

  it('支持 URL 正则前缀', function (done) {
    const app = new Connect();
    app.use(/a/, function (ctx) {
      ctx.response.end('this is a');
    });
    app.use(/b/, function (ctx) {
      ctx.response.end('this is b');
    });
    request(app.server)
      .get('/b')
      .expect(200)
      .expect('this is b', done);
  });

  it('支持多个混合中间件', function (done) {
    const app = new Connect();
    const status: any = {};
    app.use('/', function (ctx) {
      status.x = true;
      ctx.next();
    });
    app.use('/a', function (ctx) {
      status.a = true;
      ctx.next();
    });
    app.use('/a/b', function (ctx) {
      status.ab = true;
      ctx.next();
    });
    app.use('/b', function (ctx) {
      status.b = true;
      ctx.next();
    });
    app.use('/b/b', function (ctx) {
      status.bb = true;
      ctx.next();
    });
    app.use('/c', function (ctx) {
      status.c = true;
      ctx.next();
    });
    app.use('/', function (ctx) {
      status.d = true;
      ctx.response.end('end');
    });
    request(app.server)
      .get('/b/b')
      .expect(200)
      .expect('end', function () {
        expect(status).to.deep.equal({
          x: true,
          b: true,
          bb: true,
          d: true,
        });
        done();
      });
  });

});
