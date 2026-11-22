import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix

df = pd.read_csv("data/re_dataset.csv", encoding="latin-1")

def label(r):
    if r["HS_Religion"] == 1 or r["HS_Race"] == 1: return "sara"
    if r["Abusive"] == 1: return "rude"
    return "none"

df["label"] = df.apply(label, axis=1)
X_tr, X_te, y_tr, y_te = train_test_split(
    df["Tweet"], df["label"], test_size=0.2, stratify=df["label"], random_state=42)

vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2)
clf = LogisticRegression(max_iter=1000, class_weight="balanced")
clf.fit(vec.fit_transform(X_tr), y_tr)

pred = clf.predict(vec.transform(X_te))
print(classification_report(y_te, pred, digits=3))   # precision, recall, F1
print(confusion_matrix(y_te, pred))