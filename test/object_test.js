import test from 'ava';

var chai = require('chai');
var chaiHttp = require('chai-http');

var crypto = require('crypto');

var should = chai.should();

chai.use(chaiHttp);

const server = "localhost:3000"

function putObject(path, object){
    const body = JSON.stringify(object);
    return chai.request(server)
        .put(path)
        .set('content-type', 'application/json')
        .send(body);
}

test.beforeEach(async t => {
    let user = crypto.randomBytes(5).toString('hex');
    let obj = crypto.randomBytes(5).toString('hex');
    t.context.user = user;
    t.context.obj = obj;

    await chai
        .request(server)
        .put('/' + user)
        .send();
})

test("Create Object", t => {
    const body = JSON.stringify({'miao': 'love'});
    let path = '/' + t.context.user + '/bar01';
    return chai.request(server)
        .put(path)
        .set('content-type', 'application/json')
        .send(body)
        .then(res => {
            t.is(res.status, 201);
            t.true('status' in res.body);
            t.is(res.body['status'], 'success');
            t.true('message' in res.body);
            t.is('created new object', res.body['message'])
            t.true('user' in res.body);
            t.is(t.context.user, res.body['user']);
            t.true('obj' in res.body);
            t.is('bar01', res.body['obj']);
            t.true('object' in res.body);
            t.deepEqual(JSON.parse(body), res.body['object']);
        });
});

test("Get object back", async t => {
    const body = JSON.stringify({'foo': 'bar'});
    let path = '/' + t.context.user + '/bar02';
    await chai.request(server)
        .put(path)
        .set('content-type', 'application/json')
        .send(body);
    let res = await chai.request(server)
        .get(path)
        .send();
    t.is(res.status, 200);
    t.deepEqual(res.body, JSON.parse(body));
});

test("Get only a property of the object", async t => {
    const object = {'foo': 'bar'};
    let path = '/' + t.context.user + '/' + t.context.obj;
    await putObject(path, object);

    let request = JSON.stringify({'action': 'extract', 'path': '$.foo'});
    let res = await chai.request(server)
        .patch(path)
        .set('content-type', 'application/json')
        .send(request);

    t.is(res.status, 200);
    t.is('bar', res.body.result);
    t.is('success', res.body.status);
});

test("Get complex property of the object", async t => {
    const object = {'foo': 'bar', 'baz': [1,{'ema' : '<3'},3]};
    let path = '/' + t.context.user + '/' + t.context.obj;
    await putObject(path, object);

    let request = JSON.stringify({'action': 'extract', 'path': '$.baz[1].ema'});
    let res = await chai.request(server)
        .patch(path)
        .set('content-type', 'application/json')
        .send(request);

    t.is(res.status, 200);
    t.is('<3', res.body.result);
    t.is('success', res.body.status);
});
