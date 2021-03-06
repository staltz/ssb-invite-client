import run = require('promisify-tuple');
import {plugin, muxrpc} from 'secret-stack-decorators';
var explain = require('explain-error');
var Ref = require('ssb-ref');

@plugin('1.0.0')
class invite {
  private readonly ssb: any;

  constructor(ssb: any) {
    this.ssb = ssb;
  }

  private parseInvite(input: any): [any, any?] {
    let invite: string =
      input && typeof input === 'object' ? input.invite : input;

    if (typeof invite !== 'string' || !invite) {
      return [new Error('is not a string invite code: ' + invite)];
    }

    // remove surrounding whitespaces and quotes
    invite = invite.trim();
    if (invite.charAt(0) === '"' && invite.charAt(invite.length - 1) === '"') {
      invite = invite.slice(1, -1);
    }
    invite = invite.trim();

    if (!Ref.isInvite(invite)) {
      return [new Error('is not an invite code: ' + invite)];
    }

    if (Ref.isLegacyInvite(invite)) {
      var parts = invite.split('~');
      const parsed = Ref.parseAddress(parts[0]); //.split(':')
      //convert legacy code to multiserver invite code.
      var protocol = 'net:';
      if (parsed.host.endsWith('.onion')) protocol = 'onion:';
      parsed.remote =
        protocol +
        parsed.host +
        ':' +
        parsed.port +
        '~shs:' +
        parsed.key.slice(1, -8) +
        ':' +
        parts[1];
      return [null, parsed];
    } else {
      const parsed = Ref.parseInvite(invite);
      return [null, parsed];
    }
  }

  @muxrpc('async')
  public accept = async (invite: any, cb: any) => {
    if (!this.ssb.conn || !this.ssb.conn.connect || !this.ssb.conn.remember) {
      cb(new Error('ssb-invite-client requires ssb-conn'));
      return;
    }

    // parse the code
    const [e0, parsed] = this.parseInvite(invite);
    if (e0) return cb(explain(e0, 'Could not accept invalid invite code'));

    // connect via SSB CONN
    const addr = parsed.remote;
    const connData = {type: 'pub', autoconnect: true};
    const [e1, rpc] = await run<any>(this.ssb.conn.connect)(addr, connData);
    if (e1) return cb(explain(e1, 'Could not connect to pub'));

    // command the peer to follow me
    const [e2] = await run(rpc.invite.use)({feed: this.ssb.id});
    if (e2) return cb(explain(e2, 'Invite not accepted by the pub'));

    // follow the peer
    const [e3] = await run(this.ssb.publish)({
      type: 'contact',
      following: true,
      autofollow: true,
      contact: parsed.key,
    });
    if (e3) return cb(explain(e3, 'Unable to follow friend behind invite'));

    // announce the pub to my friends
    const [e4] = await run(this.ssb.publish)({
      type: 'pub',
      address: parsed,
    });
    if (e4) return cb(explain(e4, 'Unable to announce pub to my friends'));

    // remember in SSB CONN
    const [e5] = await run(this.ssb.conn.remember)(addr, connData);
    if (e5) return cb(explain(e5, 'Could not store the pub in ssb-conn'));

    cb(null, true);
  };

  @muxrpc('async')
  public use = (_opts: any, cb: any) => {
    cb(new Error('ssb.invite.use not supported by ' + this.ssb.id));
  };

  @muxrpc('async')
  public create = (_opts: any, cb: any) => {
    cb(new Error('ssb.invite.create not supported by ' + this.ssb.id));
  };
}

module.exports = invite;
