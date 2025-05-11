#!/usr/bin/perl
use strict;
use warnings;
use utf8;
use CGI;
use LWP::UserAgent;
use URI;
use Encode qw(encode_utf8 decode decode_utf8);

my $TIMEOUT = 20;

my $q = CGI->new;
my $target_url = $q->param('url');

unless ($target_url) {
    print_error(400, "Bad Request: Missing 'url' parameter.");
    exit;
}

unless ($target_url =~ m{^https?://}i) {
     print_error(400, "Bad Request: Invalid URL format. Must start with http:// or https://");
     exit;
}

my $ua = LWP::UserAgent->new;
$ua->timeout($TIMEOUT);
$ua->protocols_allowed( [ 'http', 'https'] );

print STDERR "Proxying request for: $target_url\n";

my $response;
eval {
    $response = $ua->get($target_url);
};
if ($@) {
    my $error_msg = "Server Error: Exception during fetch for $target_url - $@";
    print STDERR "$error_msg\n";
    print_error(500, $error_msg);
    exit;
}

if ($response && $response->is_success) {
    my $content_type = $response->header('Content-Type') || 'text/html';
    my $charset = '';
    
    if ($content_type =~ /charset\s*=\s*([\w-]+)/i) {
        $charset = lc($1);
    }
    
    my $raw_content = $response->decoded_content(charset => 'none');
    my $content;
    
    if ($charset && $charset ne 'utf-8') {
        eval {
            $content = decode($charset, $raw_content, Encode::FB_CROAK);
        };
        if ($@) {
            eval {
                $content = decode_utf8($raw_content, Encode::FB_CROAK);
            };
            if ($@) {
                $content = decode_utf8($raw_content, Encode::FB_DEFAULT);
            }
        }
    } else {
        $content = decode_utf8($raw_content, Encode::FB_DEFAULT);
    }

    my $base_uri = URI->new($target_url);
    
    $content =~ s{<head>}{<head>\n<base href="$target_url">}i;
    $content =~ s{
        (?:
            # src attributes
            (<(?:img|script|iframe|source)\s[^>]*?src=["'])([^"'>]+)(["'])
            |
            # href attributes
            (<(?:link|a)\s[^>]*?href=["'])([^"'>]+)(["'])
            |
            # CSS url()
            (url\s*\(\s*['"]?)([^'";\)\s]+)(["']?\s*\))
        )
    }{
        if ($2) {    # src match
            $1 . rewrite_url($2, $base_uri) . $3;
        } elsif ($5) { # href match
            $4 . rewrite_url($5, $base_uri) . $6;
        } else {     # CSS url() match
            $7 . rewrite_url($8, $base_uri) . $9;
        }
    }xegi;

    print "Content-Type: text/html; charset=utf-8\n";
    print "Access-Control-Allow-Origin: *\n\n";
    
    $content = encode_utf8($content) if Encode::is_utf8($content);
    print $content;

} else {
    my $status_code = $response ? $response->code : 500;
    my $error_message = $response ? $response->status_line : "Unknown error fetching URL";
    my $full_error = "Error fetching URL: $target_url - $error_message";

    print STDERR "$full_error\n";
    print_error($status_code, $full_error);
}

exit;

# rewrite_url subroutine
sub rewrite_url {
    my ($url, $base) = @_;
    return $url if $url =~ m{^(?:[a-z]+:)?//}i || $url =~ m{^data:}i;
    return URI->new_abs($url, $base)->as_string;
}

# print_error subroutine
sub print_error {
    my ($code, $msg) = @_;
    my $status = {
        400 => 'Bad Request',
        404 => 'Not Found',
        500 => 'Internal Server Error',
        504 => 'Gateway Timeout'
    }->{$code} || 'Error';
    
    print $q->header(
        -status => "$code $status",
        -type => 'text/plain',
        -charset => 'utf-8',
        -access_control_allow_origin => '*'
    ), $msg, "\n";
}

