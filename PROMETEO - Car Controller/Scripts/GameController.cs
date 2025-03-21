using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

public class GameManager : MonoBehaviour
{
    // ��ʼ��Ϸ����
    [Header("�Ѷ�����")]
    public int initialKeyUsage = 5;
    public int initialCollisionChance = 10;
    public AudioSource collideSound; 

    // ��ǰ��Ϸ����
    private int currentKeys;
    private int currentCollisions;
    private float countingTime;
    private bool isGameActive;
    private int lastCollideTime = 0;

    // UI����
    public Text keysText;
    public Text collisionsText;
    public Text timerText;
    public Button startButton;
    public GameObject gameEndPanel;
    public Text resultText;

    public static GameManager Instance { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(this);
        }
        else
        {
            Instance = this;
        }
    }

    void Start()
    {
        // ��ʼ��UI״̬
        gameEndPanel.SetActive(false);
        //startButton.onClick.AddListener(StartNewGame);
        StartNewGame();
        UpdateUI();
    }

    void Update()
    {
        if (isGameActive)
        {
            // ���µ���ʱ
            countingTime += Time.deltaTime;
            UpdateTimerDisplay();
        }
    }

    public bool IsActive()
    {
        return isGameActive;
    }

    public void StartNewGame()
    {
        // ������Ϸ����
        currentKeys = initialKeyUsage;
        currentCollisions = initialCollisionChance;
        countingTime = 0;
        isGameActive = true;
        lastCollideTime = 0;
        keyIds = new List<int>();

        // ����UI
        gameEndPanel.SetActive(false);
        UpdateUI();
        Time.timeScale = 1f;
    }

    // ʹ�ó�Կ�׷���
    private List<int> keyIds = new List<int>();
    public bool UseCarKey(int keyId)
    {
        if (keyIds.Contains(keyId))
        {
            return true;
        }
        keyIds.Add(keyId);
        if (isGameActive && currentKeys > 0)
        {
            currentKeys--;
            keysText.text = $"Կ�״���: {currentKeys}";
            return true;
        }
        return false;
    }

    // ������ײ�¼�
    public void HandleCollision()
    {
        if (!isGameActive) return;

        int currentTime = Mathf.FloorToInt(countingTime);
        if ((currentTime - lastCollideTime) < 3)
        {
            return;
        }

        lastCollideTime = currentTime;
        collideSound.Play();
        if (currentCollisions > 0)
        {
            currentCollisions--;
            collisionsText.text = $"ʣ����ײ: {currentCollisions}";
        }

        if (currentCollisions <= 0)
        {
            GameEnd(false);
        }
    }

    // ��������UI��ʾ
    void UpdateUI()
    {
        keysText.text = $"Կ�״���: {currentKeys}";
        collisionsText.text = $"ʣ����ײ: {currentCollisions}";
        UpdateTimerDisplay();
    }

    // ���¼�ʱ����ʾ
    void UpdateTimerDisplay()
    {
        int seconds = Mathf.FloorToInt(countingTime);
        timerText.text = $"ʱ��: {seconds}";
    }

    // ��Ϸ��������
    public void GameEnd(bool pass)
    {
        isGameActive = false;
        Time.timeScale = 0f;
        gameEndPanel.SetActive(true);
        resultText.text = pass ? "��ս�ɹ�^_^!" : "��սʧ��T_T.";
    }
}