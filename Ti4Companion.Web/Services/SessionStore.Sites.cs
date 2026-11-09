#if SITES_WORKER
namespace Ti4Companion.Web.Services;

public partial class SessionStore
{
    private CancellationTokenSource? _sitesPolling;
    private bool _sitesConnected;

    private Task EnsureHubAsync(string code)
    {
        if (_sitesPolling is not null && _joinedCode == code) return Task.CompletedTask;
        StopSitesPolling();
        _joinedCode = code;
        _sitesConnected = true;
        _sitesPolling = new CancellationTokenSource();
        _ = PollSitesAsync(code, _sitesPolling.Token);
        return Task.CompletedTask;
    }

    private void StopSitesPolling()
    {
        _sitesPolling?.Cancel();
        _sitesPolling?.Dispose();
        _sitesPolling = null;
        _sitesConnected = false;
    }

    private async Task PollSitesAsync(string code, CancellationToken token)
    {
        try
        {
            while (Session?.JoinCode == code)
            {
                await Task.Delay(_sitesConnected ? 1000 : 3000, token);
                if (Session?.JoinCode != code) break;
                var connected = true;
                using var request = CancellationTokenSource.CreateLinkedTokenSource(token);
                request.CancelAfter(TimeSpan.FromSeconds(8));
                try { await RefreshAsync(request.Token); }
                catch (HttpRequestException) { connected = false; }
                catch (OperationCanceledException) when (!token.IsCancellationRequested) { connected = false; }
                if (token.IsCancellationRequested || Session?.JoinCode != code) break;
                if (_sitesConnected == connected) continue;
                _sitesConnected = connected;
                OnChange?.Invoke();
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
}
#endif
