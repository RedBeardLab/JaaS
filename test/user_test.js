import test from 'ava';

var chai = require('chai');
var chaiHttp = require('chai-http');

var should = chai.should();

chai.use(chaiHttp);

const server = "localhost:3000"

test("JaaS User", t => {
    return chai.request(server)
            .put('/foo01')
            .then(res => {
                t.is(res.status, 201);
                res.body.should.be.a('object');
                t.true('status' in res.body);
                t.true('message' in res.body);
            });
});

/*
describe("JaaS Object", () => {
    
    before((done) => {
        chai.request(server)
            .put('/foo02')
            .end((err, res) => {
                done();
            });
    });

    it('it should create a new object', (done) => {
        const body = JSON.stringify({'miao': 'love'});
        chai.request(server)
            .put('/foo02/bar01')
            .send(body)
            .end((err, res) => {
                res.should.have.status(201);
                res.body.should.be.a('object');
                res.body.should.have.property('status');
                res.body['status'].should.equal('success');
                res.body.should.have.property('message');
                res.body['message'].should.equal('created new object');
                res.body.should.have.property('user');
                res.body['user'].should.equal('foo02')
                res.body.should.have.property('obj');
                res.body['obj'].should.equal('bar01');
                res.body.should.have.property('object');
                res.body['object'].should.equal(body);

                done();
            });
    });

    it('it should insert a new object', (done) => {
      const request = {'path': '$.gatto', 
                         'value': 'love', 
                         'action': 'insert'}
        const body = JSON.stringify(request);
        chai.request(server)
            .patch('/foo02/bar01')
            .send(body)
            .end((err, res) => {
                res.should.have.status(200);

                done();
            });
    });

});

*/
